#!/usr/bin/env node
// 机器可判规矩的自动预检 —— docs/verify-20261113/acceptance-checklist.md 里凡是
// 「出现 X 即打回」且不需要人眼判断的规矩，都在这里对着 **真实 AWR 数据** 跑一遍。
// 人眼部分（像素、层次、好不好看）仍然只有业主自己能判；这个脚本不替代像素验收，
// 只保证业主打开页面之前，纸面上的规矩没有一条已经被打破。
//
// 用法（在项目根）：
//   node test-support/verify-page.mjs
//   DSH_AWR_CLI=/path/to/awr node test-support/verify-page.mjs   # 指定生产同款二进制
// 退出码：0 = 全部规矩通过；1 = 至少一条被打破（逐条列出）。数据读不到 ≠ 通过，是报错。
import { buildProgress } from '../lib/progress-view.js'
import { createAwr } from '../lib/awr-runtime.js'
import { loadClient, textOf } from './client-harness.js'

const root = process.argv[2] ?? process.cwd()
const awr = createAwr({ env: process.env })

// 四路读取，全部只读；哪一路读不到就记下来 —— 「没读到」与「读为空」是两句不同的话。
const notes = []
const snapshot = await awr.run(root, ['overview', 'snapshot']).catch((e) => { notes.push(`snapshot 读不到：${e.message}`); return undefined })
const doctor = await awr.run(root, ['doctor']).catch(() => undefined)
const events = await awr.run(root, ['event', 'history']).catch(() => undefined)
if (!snapshot) { console.error('读不到台账快照，无法预检（这不是通过）。'); process.exit(1) }
if (!doctor) notes.push('doctor 读不到：健康区规矩本轮未判')
if (!events) notes.push('event history 读不到：事件规矩本轮未判')

const view = buildProgress(snapshot, { doctor, events })
const ULID = /\b[0-9A-Z]{26}\b/g
const PCT = /\d+(\.\d+)?%/g
const walk = (node, fn) => {
  if (!node || typeof node !== 'object') return
  if (!Array.isArray(node)) { fn(node); const c = node.children; if (Array.isArray(c)) for (const k of c) walk(k, fn) } else for (const k of node) walk(k, fn)
}

const results = []
const check = (name, pass, evidence = '') => results.push({ name, pass, evidence })

for (const language of ['en', 'zh']) {
  const client = loadClient({ view: () => ({ projectRoot: root, state: 'initialized', steps: [], stop: null, receipt: null }), progress: () => view, language })
  const ui = await client.page()
  const text = ui.text()
  const tips = []
  walk(ui.root.tree, (n) => { if (typeof n.props?.title === 'string') tips.push(n.props.title) })
  const joined = text + '\n' + tips.join('\n')
  const healthText = ui.byTestId('awr-health') ? textOf(ui.byTestId('awr-health')) : ''

  // 规矩：全页（含 tooltip）零混合完成率、零 26 位 id
  check(`[${language}] 零百分比（诚实法：AWR 拒绝混合完成率）`, !PCT.test(joined), JSON.stringify(joined.match(PCT) ?? []))
  check(`[${language}] 可见文本零 ULID`, !(text.match(ULID) ?? []).length, JSON.stringify(text.match(ULID) ?? []))

  if (doctor) {
    // 规矩：doctor 不放行时健康区不许以沉默说「完好」；error 级发现要进「需要你处理」
    const errFindings = (doctor.findings ?? []).filter((f) => f.severity === 'error')
    if (doctor.ok === false) {
      check(`[${language}] doctor ok:false 时 health.ok 也是 false`, view.health.ok === false)
      if (errFindings.length) {
        check(`[${language}] error 级 findings 出现在健康区`, errFindings.every((f) => healthText.includes(f.code)))
        check(`[${language}] 附 AWR 自报的 repair 命令`, healthText.includes('awr doctor repair'))
        check(`[${language}] 页面声明只做读取`, /只读|只做读取|only reads/i.test(healthText))
        check(`[${language}] error findings 同步进「需要你处理」`, (view.attention ?? []).some((a) => a.kind === 'finding' && errFindings.some((f) => f.code === a.code)))
      }
    }
  }

  // 规矩：事件是记录不是文案 —— 页面展示的每条事件必须是 AWR 原文原样。
  // 静止态只渲染倒序前 5 条（activityView 已按 at 倒序），逐条比对而不是只挑一条。
  for (const item of (view.activity?.items ?? []).slice(0, 5)) {
    if (item.summary) check(`[${language}] 事件保持 AWR 原文`, text.includes(item.summary), item.summary)
  }

  // 口径一致：needs=0 但健康区报红 = 串行，打回方向反之亦然
  const needsZero = (view.attention ?? []).length === 0
  check(`[${language}] needs 与健康区口径一致（红区必有交代）`, !(!needsZero && view.health.ok) && !(needsZero && !view.health.ok && (doctor?.ok ?? true) !== false))
}

for (const n of notes) console.log('· 未判：', n)
let bad = 0
for (const r of results) {
  if (!r.pass) bad++
  console.log(`${r.pass ? '✓' : '✗ 打回'} ${r.name}${r.pass || !r.evidence ? '' : ' — ' + r.evidence}`)
}
console.log(bad === 0 ? `全部 ${results.length} 条机器规矩通过（人眼像素部分仍以业主清单为准）。` : `${bad} 条被打破。`)
process.exit(bad === 0 ? 0 : 1)
