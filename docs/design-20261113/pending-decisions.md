# 待业主拍板清单（2026-11-13 汇总）

> 作用：散在企业微信汇报与设计文档里的待拍板项集中在此。每条给：问题原话、决策材料在哪、以及**不拍板时系统的现行默认行为**（即沉默的实际后果）。agent 侧全部闸门已绿，等的是决策，不是进度。

## ① 进展页『下一步』的三层层序是否定稿

- **问题**：结论（做什么）→ 归因（属于哪个工作项/谁/是否阻塞）→ 指标（主线 x/y、台账 x/y、验收标准条数）→ 展开看原文。这个层序定稿了吗？
- **材料**：`docs/design-20261113/progress-page-benchmark.md`（对标 dsh-context 的 734 条文案与 10 条设计 DNA）；`npm run verify:page` 双语渲染实测。
- **不拍板的默认**：按现行三层结构继续打磨细节，不再扩新板块。

## ② 是否认可『永不出混合完成率』

- **问题**：AWR accounting 明确拒绝 blended completion percent（原话 never invent a blended completion percent）。页面因此只数条数（42/ 46）、每格自带口径、未开始画斜纹，全页零百分比。认可吗？
- **材料**：进展页『目标带』区块 title 口径；`docs/progress-page.md` 的理由段。
- **不拍板的默认**：维持零混合完成率。若要百分比，需要业主明确指定口径（分母是什么），否则任何数字都是编的。

## ③ P2 做不做；做的话跨项目总览优先？

- **问题**：P2 四项（跨项目总览 / 台账趋势 / 改动与证据 / /awr 命令扩展）要不要立项。勘察结论：跨项目总览数据最扎实、价值最直接，建议优先。
- **材料**：`docs/design-20261113/p2-data-feasibility.md`（四项逐一实测）+ `docs/design-20261113/p2-overview-mockup.html`（全真实数据高保真稿：4 项目卡、attention 原话、bdp 真实数字与中文 next_action 原话）。
- **不拍板的默认**：不动 P2，一行代码不写。

## ④ P2 若做趋势：接受初期『历史还浅』真话态？改动区不碰 diff？

- **问题**：台账 11-13 才建，event history 实测 136 条全在今天。趋势上线初期就是 13 根空柱 + 今天一根，且当日 136 条里 92 条是 source 噪声（44 条工作动作）。接受这个真话态吗？另外逐 commit diff 不是 AWR 数据，『改动与证据』区只呈现 evidence/artifact 引用，不用文件时间线冒充，认可吗？
- **材料**：mockup 的趋势区与诚实脚注；feasibility memo 第②③项。
- **不拍板的默认**：趋势不做；改动与证据不做。

## ⑤ DSH-078 验收项③：chip 上的源故障标识去留

- **问题**：chip 数据路径不经 panel progress.json，拿不到 source_issues；接入需要高频 `status --cached` 轮询，低频故障场景性价比待定。页面横幅部分已交付。
- **材料**：`.awr/intake/work-ledger.yaml` DSH-078 条目 next_action（③未做的技术原因：chip 数据路径不经 panel progress.json）；bmr 事故复盘（SourceConflict 期间面板渲染 0 项无提示，修复 receipt 01M7AGT8HXEGTCEBNHD570SJNW）。
- **不拍板的默认**：chip 不加标识，页面横幅保留。

## ⑥ DSH-077 验收闸门（非设计问题，是流程动作）

- **动作**：重启桌面 App（两 profile 均软链工作区，重启即加载最新构建，无需重装）→ 按 `docs/verify-20261113/acceptance-checklist.md` 十二项逐条看像素 → 点头合并 PR #1。
- **agent 已代跑**：`npm run verify:page` 26 项机器规矩，系统 awr 0.7.0 与 lab 0.8.0 双版本全过（人不替人眼，像素项必须业主亲眼看）。
- **不拍的默认**：PR #1 挂着不合；分支持续保鲜（每轮 verify:page 复核）。

---

*本页只汇总，不新增决策；每条的权威出处以『材料』指针为准。业主拍板后在此页尾部追加结论行并注明日期。*
