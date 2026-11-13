// The progress page: a tab beside Chat and Trajectory that shows the whole project the way AWR's own Project Progress
// Overview does, in the host's interface.
//
// One gauge says how much is done and what the rest is doing. Under it, what needs the person. Then the work itself,
// three ways: by mainline (what is left in each), as a dependency graph (what waits for what), and as lanes (the
// mainlines side by side with the dependencies between them). Finished work is folded away until someone asks for it.
// A card opens the details of one piece of work in plain words; its identifiers are folded inside.

const CARD_W = 208
const CARD_H = 76
const GAP_X = 48
const GAP_Y = 12
const LANE_GAP = 32
const LANE_HEAD = 40
/** The three views, in the order of their tabs. */
const MODES = ['lines', 'graph', 'lanes']

const rank = (state) => STATE_ORDER.indexOf(state)
const byState = (a, b) => rank(a.state) - rank(b.state) || (a.layer ?? 0) - (b.layer ?? 0)
const laneTitle = (id, t, strip) => (id === '~other' ? t('lane.other') : strip && id.startsWith(strip) && id.length > strip.length ? id.slice(strip.length) : id)

/** The prefix every mainline name shares (`AWR-` of `AWR-TF`, `AWR-OBS`), which says nothing and is left out. */
function sharedPrefix(lanes) {
  const names = lanes.map((lane) => lane.id).filter((id) => id !== '~other')
  if (names.length < 2) return ''
  const first = names[0]
  const cut = first.indexOf('-')
  if (cut === -1) return ''
  const prefix = first.slice(0, cut + 1)
  return names.every((name) => name.startsWith(prefix) && name.length > prefix.length) ? prefix : ''
}

/** Everything before and after a node along the dependencies, within the nodes that are shown. */
function chainOf(key, shown) {
  const chain = new Set([key])
  const walk = (start, next) => {
    const queue = [start]
    while (queue.length) {
      const node = shown.get(queue.pop())
      for (const other of node ? next(node) : []) {
        if (shown.has(other) && !chain.has(other)) {
          chain.add(other)
          queue.push(other)
        }
      }
    }
  }
  walk(key, (node) => node.dependsOn ?? [])
  walk(key, (node) => node.unlocks ?? [])
  return chain
}

/** The layer of each shown node among the shown nodes: one more than its deepest shown dependency. */
function shownLayers(nodes, shown) {
  const memo = new Map()
  const visiting = new Set()
  const depth = (node) => {
    if (memo.has(node.key)) return memo.get(node.key)
    if (visiting.has(node.key)) return 0
    visiting.add(node.key)
    let deepest = -1
    for (const key of node.dependsOn ?? []) if (shown.has(key)) deepest = Math.max(deepest, depth(shown.get(key)))
    visiting.delete(node.key)
    memo.set(node.key, deepest + 1)
    return deepest + 1
  }
  for (const node of nodes) depth(node)
  return memo
}

/**
 * The dependency graph: columns are layers, left to right. Within a column the cards follow the average row of what
 * they depend on, which keeps most lines short. Work that depends on nothing shown and unlocks nothing shown is not part
 * of the graph; it is returned as `loose`.
 */
function graphLayout(nodes) {
  const shown = new Map(nodes.map((node) => [node.key, node]))
  const linked = nodes.filter((node) => (node.dependsOn ?? []).some((key) => shown.has(key)) || (node.unlocks ?? []).some((key) => shown.has(key)))
  const loose = nodes.filter((node) => !linked.includes(node))
  const layerOf = shownLayers(linked, shown)
  const columns = []
  for (const node of linked) (columns[layerOf.get(node.key)] ??= []).push(node)
  const row = new Map()
  const mean = (keys) => {
    const rows = keys.filter((key) => row.has(key)).map((key) => row.get(key))
    return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : undefined
  }
  const settle = (column, weigh) => {
    const weight = new Map(column.map((node, at) => [node.key, weigh(node) ?? at]))
    column.sort((a, b) => weight.get(a.key) - weight.get(b.key) || byState(a, b))
    column.forEach((node, at) => row.set(node.key, at))
  }
  // The first column starts in mainline order; then each column follows what it depends on, each column follows what
  // depends on it, and once more forward. Three sweeps are enough to take most of the crossings out.
  if (columns[0]) {
    columns[0].sort((a, b) => String(a.lane).localeCompare(String(b.lane)) || byState(a, b))
    columns[0].forEach((node, at) => row.set(node.key, at))
  }
  for (let index = 1; index < columns.length; index += 1) settle(columns[index], (node) => mean(node.dependsOn ?? []))
  for (let index = columns.length - 2; index >= 0; index -= 1) settle(columns[index], (node) => mean(node.unlocks ?? []))
  for (let index = 1; index < columns.length; index += 1) settle(columns[index], (node) => mean(node.dependsOn ?? []))
  const place = new Map()
  columns.forEach((column, x) => column.forEach((node, y) => place.set(node.key, { x: x * (CARD_W + GAP_X), y: y * (CARD_H + GAP_Y) })))
  const edges = []
  for (const node of linked) {
    for (const key of node.dependsOn ?? []) {
      if (!place.has(key)) continue
      const from = place.get(key)
      const to = place.get(node.key)
      const sx = from.x + CARD_W
      const sy = from.y + CARD_H / 2
      const tx = to.x
      const ty = to.y + CARD_H / 2
      const bend = Math.max(24, (tx - sx) / 2)
      edges.push({ id: `${key}>${node.key}`, from: key, to: node.key, d: `M${sx} ${sy}C${sx + bend} ${sy},${tx - bend} ${ty},${tx} ${ty}` })
    }
  }
  const width = columns.length ? columns.length * (CARD_W + GAP_X) - GAP_X : 0
  const height = Math.max(0, ...columns.map((column) => column.length * (CARD_H + GAP_Y) - GAP_Y))
  return { place, edges, width, height, linked, loose }
}

/** The lanes: one column per mainline, its work from top to bottom in dependency order. */
function lanesLayout(nodes, lanes) {
  const shown = new Map(nodes.map((node) => [node.key, node]))
  const layerOf = shownLayers(nodes, shown)
  const columns = lanes.map((lane) => ({ lane, nodes: nodes.filter((node) => node.lane === lane.id).sort((a, b) => layerOf.get(a.key) - layerOf.get(b.key) || byState(a, b)) })).filter((column) => column.nodes.length)
  const place = new Map()
  columns.forEach((column, x) => column.nodes.forEach((node, y) => place.set(node.key, { x: x * (CARD_W + LANE_GAP), y: LANE_HEAD + y * (CARD_H + GAP_Y), column: x })))
  const edges = []
  for (const node of nodes) {
    for (const key of node.dependsOn ?? []) {
      if (!place.has(key)) continue
      const from = place.get(key)
      const to = place.get(node.key)
      let d
      if (from.column === to.column) {
        const x = from.x
        const sy = from.y + CARD_H / 2
        const ty = to.y + CARD_H / 2
        d = `M${x} ${sy}C${x - 14} ${sy},${x - 14} ${ty},${x} ${ty}`
      } else {
        const right = to.column > from.column
        const sx = right ? from.x + CARD_W : from.x
        const tx = right ? to.x : to.x + CARD_W
        const sy = from.y + CARD_H / 2
        const ty = to.y + CARD_H / 2
        const bend = (right ? 1 : -1) * Math.max(16, Math.abs(tx - sx) / 2)
        d = `M${sx} ${sy}C${sx + bend} ${sy},${tx - bend} ${ty},${tx} ${ty}`
      }
      edges.push({ id: `${key}>${node.key}`, from: key, to: node.key, d, cross: from.column !== to.column })
    }
  }
  const width = columns.length ? columns.length * (CARD_W + LANE_GAP) - LANE_GAP : 0
  const height = LANE_HEAD + Math.max(0, ...columns.map((column) => column.nodes.length * (CARD_H + GAP_Y) - GAP_Y))
  return { place, edges, width, height, columns }
}

/** One piece of work as a card: its state in a word and a light, and its title. */
function WorkCard({ node, t, selected, dim, fixed, onPick, onHover }) {
  const strong = node.state === 'active' || node.state === 'blocked' || node.state === 'waiting'
  return h('button', {
    type: 'button',
    className: 'awr-card',
    'data-key': node.key,
    'data-state': node.state,
    'data-dim': dim ? 'true' : undefined,
    'aria-pressed': selected,
    title: node.title,
    style: fixed ? { position: 'absolute', left: fixed.x, top: fixed.y, width: CARD_W, height: CARD_H, minHeight: 0 } : undefined,
    onClick: () => onPick(node.key),
    onMouseEnter: onHover ? () => onHover(node.key) : undefined,
    onMouseLeave: onHover ? () => onHover(undefined) : undefined,
    onFocus: onHover ? () => onHover(node.key) : undefined,
    onBlur: onHover ? () => onHover(undefined) : undefined,
  },
  h('span', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, lineHeight: '16px', color: strong ? STATE_COLOR[node.state] : C.text3 } },
    h(Light, { state: node.state }), t(`state.${node.state}`)),
  h('span', { className: 'awr-clamp2', style: { fontSize: 13, lineHeight: '18px', color: node.state === 'done' || node.state === 'cancelled' ? C.text3 : C.text } }, node.title))
}

/**
 * An empty place, named as one of the three kinds of empty there are (DSH-079): nothing has been written yet,
 * something is broken so nothing can be read, or this cut of the work happens to be empty. Each says why it is empty
 * and what would fill it, so an empty page is never read as a finished project — or as a working one.
 */
function EmptyState({ kind = 'none', testid, reason, action, dense, t }) {
  const copy = { none: ['empty.nowork.title', 'empty.nowork.body'], broken: ['empty.source.title', 'empty.source.body'], filtered: ['empty.nomatch', 'empty.filter.body'] }[kind]
  return h('div', {
    ...(testid ? { 'data-testid': testid } : {}),
    ...(reason ? { 'data-reason': reason } : {}),
    'data-empty': kind,
    style: dense ? { padding: '28px 0 4px' } : { maxWidth: 420, margin: '72px auto 0' },
  },
  h('p', { style: P.title }, t(copy[0])),
  h('p', { style: P.body }, t(copy[1])),
  action ? h('div', { style: { marginTop: 12 } }, h('button', { type: 'button', className: 'awr-btn awr-btn-quiet', 'data-testid': 'awr-empty-clear', onClick: action }, t('empty.filter.clear'))) : null)
}

/**
 * The four questions asked when someone opens the page, answered before anything else: what is the goal, how far it
 * is, whose turn it is, what happens next. The distance is told one cell per piece of work, never an invented rate.
 * Every number carries how it is counted, because a number without its 口径 is a guess with better typography.
 */
function GoalBand({ progress, nodes, t, onPick }) {
  const counts = progress.counts ?? {}
  const total = counts.total || 0
  const who = [...new Set(nodes.filter((node) => node.claimedBy).map((node) => node.claimedBy))]
  const label = (title, tip) => h('div', { title: tip, style: { fontSize: 12, lineHeight: '16px', color: C.text3, marginBottom: 6 } }, title)
  const none = h('span', { style: { color: C.text3 } }, t('band.goal.none'))
  return h('div', { 'data-testid': 'awr-goalband', style: { marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px 28px', padding: '18px 0 20px', borderTop: `.5px solid ${C.line2}`, borderBottom: `.5px solid ${C.line2}` } },
    h('div', { 'data-cell': 'goal', style: { minWidth: 0 } }, label(t('band.goal'), t('tip.goal')),
      h('div', { style: { fontSize: 14, lineHeight: '20px', color: progress.goal ? C.text : C.text3 } }, progress.goal?.title || none)),
    h('div', { 'data-cell': 'howfar', style: { minWidth: 0 } }, label(t('band.howfar'), t('tip.howfar')),
      h('span', { style: { fontSize: 22, lineHeight: '28px', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: C.text } }, counts.done ?? 0),
      h('span', { style: { fontSize: 12, lineHeight: '28px', color: C.text3, fontVariantNumeric: 'tabular-nums', marginLeft: 6 } }, `/ ${total} ${t('gauge.done')}`),
      h('div', { role: 'img', 'aria-label': t('band.cells', { done: counts.done ?? 0, total }), style: { display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 6 } },
        ...nodes.map((node) => h('span', { key: node.key, title: `${node.key} · ${node.title}`, style: { width: 6, height: 12, borderRadius: 2, background: STATE_COLOR[node.state] ?? C.idle, opacity: node.state === 'planned' || node.state === 'cancelled' ? 0.3 : 0.9 } })))),
    h('div', { 'data-cell': 'who', style: { minWidth: 0 } }, label(t('band.who'), t('tip.who')),
      who.length
        ? h('div', { style: { fontSize: 14, lineHeight: '20px', color: C.text, wordBreak: 'break-word' } }, who.join(' · '))
        : h('div', { style: { fontSize: 14, lineHeight: '20px' } }, h('span', { style: { color: C.text3 } }, t('band.who.none')))),
    h('div', { 'data-cell': 'next', style: { minWidth: 0 } }, label(t('band.next'), t('tip.next')),
      progress.next?.text
        ? h('button', { type: 'button', className: 'awr-link', 'id': 'awr-band-next', title: progress.next.text, style: { textAlign: 'left', fontSize: 13, lineHeight: '20px', color: C.text }, onClick: () => onPick(progress.next.key) },
          h('span', { className: 'awr-clamp2' }, progress.next.headline ?? progress.next.text))
        : h('div', { style: { fontSize: 13, lineHeight: '20px' } }, h('span', { style: { color: C.text3 } }, t('band.next.none')))))
}

/**
 * The gauge: one bar for the whole project, measured against the whole ledger so the eye cannot be fooled by a bar
 * that only draws what has happened. Work that has not started is hatched, not inked, and work AWR counted but this
 * page has no colour for is hatched too rather than dropped. The counts are the fact; the bar is the shape of it.
 * No percentage is printed here, because AWR refuses a blended completion rate — see `accounting` in the footer.
 */
function Gauge({ counts, t, only, onOnly }) {
  const total = counts.total || 0
  const known = ['done', 'active', 'blocked', 'waiting', 'ready', 'planned']
  const parts = known.map((state) => ({ state, value: counts[state] ?? 0 })).filter((part) => part.value > 0)
  const drawn = parts.reduce((sum, part) => sum + part.value, 0)
  const baseline = Math.max(total, drawn)
  // Anything AWR counted that this page does not draw (cancelled, or a state newer than this plugin) keeps its width.
  const rest = Math.max(0, baseline - drawn)
  // Work that has not started is drawn as a hatch, not as ink, so an untouched reserve never reads as progress.
  const hatch = `repeating-linear-gradient(45deg, ${C.faint} 0 2px, transparent 2px 5px)`
  const segment = (state, value) => h('span', {
    key: state, 'data-part': state, title: `${t(`state.${state}`)} ${value} · ${t(`tip.${state}`)}`,
    style: { width: `${baseline ? (value / baseline) * 100 : 0}%`, minWidth: value ? 3 : 0, background: state === 'planned' || state === 'ready' ? hatch : STATE_COLOR[state], opacity: only && only !== state ? 0.25 : 1, transition: `opacity .16s ${C.ease}` },
  })
  return h('div', { 'data-testid': 'awr-gauge' },
    h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 } },
      h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
        h('span', { title: t('tip.done'), style: { fontSize: 28, lineHeight: '32px', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: C.text } }, counts.done),
        h('span', { title: t('tip.howfar'), style: { fontSize: 13, lineHeight: '20px', color: C.text3, fontVariantNumeric: 'tabular-nums' } }, `/ ${total} ${t('gauge.done')}`)),
      h('span', { 'data-testid': 'awr-gauge-caliber', title: t('tip.gauge'), style: { fontSize: 12, lineHeight: '18px', color: C.text3, textAlign: 'right' } }, t('gauge.caliber'))),
    h('div', { role: 'img', 'aria-label': `${counts.done} / ${total} ${t('gauge.done')}`, title: t('tip.gauge'), style: { display: 'flex', gap: 2, height: 8, margin: '12px 0', borderRadius: 4, overflow: 'hidden', background: total ? 'transparent' : C.active } },
      ...parts.map((part) => segment(part.state, part.value)),
      rest ? h('span', { key: '~rest', 'data-part': 'rest', title: `${t('gauge.rest', { n: rest })} · ${t('tip.cancelled')}`, style: { width: `${(rest / baseline) * 100}%`, minWidth: 3, background: hatch, opacity: only ? 0.25 : 1 } }) : null),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4, margin: '0 -8px' } },
      ...['active', 'blocked', 'waiting', 'ready', 'planned', 'done'].filter((state) => (counts[state] ?? 0) > 0).map((state) => h('button', { key: state, type: 'button', className: 'awr-legend', 'data-legend': state, 'aria-pressed': only === state, 'data-off': only && only !== state ? 'true' : undefined, title: `${t(`state.${state}`)} · ${t(`tip.${state}`)}`, onClick: () => onOnly(only === state ? undefined : state) },
        h(Light, { state }), t(`state.${state}`), h('span', { style: { color: C.text3, fontVariantNumeric: 'tabular-nums' } }, counts[state])))))
}

/**
 * What this AWR can do, from its own negotiation: how many of the capabilities it declares this machine answers, and
 * each domain of them. A domain that answers less than it declares is the gap, shown in the colour of a problem.
 */
function Coverage({ coverage, t }) {
  if (!coverage) return null
  return h('div', { 'data-testid': 'awr-coverage', style: { minWidth: 0 } },
    h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } },
      h('div', { style: P.label }, t('coverage.title')),
      h('span', { style: { fontSize: 12, lineHeight: '16px', color: coverage.available < coverage.total ? C.bad : C.text3, fontVariantNumeric: 'tabular-nums' } },
        t('coverage.answered', { n: coverage.available, total: coverage.total }))),
    h('div', { style: { fontSize: 22, lineHeight: '28px', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: C.text, marginTop: 6 } },
      `${coverage.available} / ${coverage.total}`,
      coverage.cliVersion ? h('span', { style: { fontSize: 12, lineHeight: '28px', fontWeight: 400, color: C.text3, marginLeft: 8 } }, `awr ${coverage.cliVersion}`) : null),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 } },
      ...(coverage.groups ?? []).map((group) => h('span', { key: group.id, 'data-testid': 'awr-coverage-group', title: `${group.id} ${group.available} / ${group.total}`, style: { fontSize: 12, lineHeight: '18px', padding: '0 8px', borderRadius: 999, border: `.5px solid ${group.available < group.total ? C.bad : C.line2}`, color: group.available < group.total ? C.bad : C.text2, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } },
        group.id, ' ', `${group.available}/${group.total}`))))
}

/** How the project's own database stands, from `awr doctor`: what it says, in the words it means. */
/** The source complaint banner (DSH-078): a ledger AWR cannot read is shown as broken, never as an empty page. */
function SourceIssues({ issues, t }) {
  if (!issues || !issues.length) return null
  return h('div', { 'data-testid': 'awr-source-issues', role: 'alert', style: { marginTop: 16, border: `.5px solid ${C.bad}`, borderRadius: 10, padding: '12px 16px', minWidth: 0 } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
      h(Light, { state: 'blocked', size: 7 }),
      h('span', { style: { fontSize: 13, fontWeight: 600, lineHeight: '20px', color: C.bad } }, t('sourceissues.title'))),
    h('div', { style: { marginTop: 6, fontSize: 12.5, lineHeight: '18px', color: C.text2 } }, t('sourceissues.hint')),
    h('ul', { style: { margin: '6px 0 0', paddingLeft: 18, display: 'grid', gap: 6, minWidth: 0 } },
      ...issues.map((issue, index) => h('li', { key: index, style: { fontSize: 12.5, lineHeight: '18px', color: C.text2, wordBreak: 'break-word' } },
        h('code', { style: { fontSize: 12, color: C.bad, marginRight: 6 } }, issue.code), issue.message))),
    h('div', { style: { marginTop: 10, fontSize: 12.5, lineHeight: '18px', color: C.text2 } }, t('sourceissues.fix')))
}

function Health({ health, t }) {
  if (!health) return null
  const ISSUE = { database: 'health.issue.database', schema: 'health.issue.schema', references: 'health.issue.references', integrity: 'health.issue.integrity' }
  return h('div', { 'data-testid': 'awr-health', style: { minWidth: 0 } },
    h('div', { style: P.label }, t('health.title')),
    health.ok
      ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 } },
        h(Light, { state: 'done', size: 7 }),
        h('span', { style: { fontSize: 14, lineHeight: '20px', color: C.text } }, t('health.ok')),
        Number.isFinite(health.schemaVersion) ? h('span', { style: { fontSize: 12, lineHeight: '20px', color: C.text3, fontVariantNumeric: 'tabular-nums' } }, t('health.schema', { v: health.schemaVersion })) : null)
      : h('div', { style: { marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 } },
        ...health.issues.map((issue) => h('div', { key: issue, style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, lineHeight: '20px', color: C.bad } },
          h(Light, { state: 'blocked', size: 7 }), t(ISSUE[issue] ?? 'health.issue.database'))),
        Number.isFinite(health.schemaVersion) ? h('div', { style: { fontSize: 12, lineHeight: '18px', color: C.text3, fontVariantNumeric: 'tabular-nums' } }, t('health.schema', { v: health.schemaVersion })) : null))
}

/** The honesty box: AWR withholds an effort number until it has an approved contract and verified observations. What it does say is passed through as said. */
function AccountingFacts({ accounting, t }) {
  if (!accounting) return null
  return h('div', { 'data-testid': 'awr-accounting', style: { minWidth: 0 } },
    h('div', { style: P.label }, t('accounting.title')),
    accounting.available === true
      ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '2px 16px', marginTop: 6, fontSize: 13, lineHeight: '20px', color: C.text, fontVariantNumeric: 'tabular-nums' } },
        ...Object.entries(accounting).filter(([key, value]) => key !== 'available' && (typeof value === 'number' || typeof value === 'string')).map(([key, value]) => h('span', { key }, `${key} ${value}`)))
      : h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 6 } },
        h('span', { style: { transform: 'translateY(6px)' } }, h(Light, { state: 'waiting', size: 7 })),
        h('span', { title: accounting.detail ? `${accounting.reason ?? ''} ${accounting.detail}` : undefined, style: { fontSize: 13, lineHeight: '20px', color: C.text2, minWidth: 0 } }, t('accounting.notyet'))))
}

/**
 * The next step, told in the three layers a person reads: the sentence to act on, why it is on them, and what it
 * moves. The line, the reason and the numbers are AWR's words and AWR's counts; a fact AWR does not have leaves its
 * row out instead of being filled in.
 */
function NextStep({ next, guidance, accounting, counts, t, onPick }) {
  if (!next) return null
  const links = Array.isArray(next.links) ? next.links : []
  const checklist = Array.isArray(next.checklist) ? next.checklist : []
  const notPercent = accounting && accounting.available !== true && typeof accounting.detail === 'string' ? accounting.detail.trim() : ''
  const chips = []
  if (next.lane) chips.push({ key: 'lane', tip: t('step.lane.tip'), text: `${t('step.lane', { id: next.lane.id })} ${next.lane.done} / ${next.lane.total}` })
  if (counts?.total) chips.push({ key: 'ledger', text: t('step.ledger', { total: counts.total, done: counts.done ?? 0 }) })
  if (checklist.length) chips.push({ key: 'acceptance', text: t('step.acceptance', { n: checklist.length }) })
  // The reason it is on you: what it is stuck on, what it waits for, and failing both, who has it. An older host
  // gives only the line, which for stuck and waiting work is exactly that reason.
  const held = next.claimedBy ? t('step.held', { who: next.claimedBy }) : next.claimed ? t('step.claimed') : t('step.unheld')
  const stuck = next.blocker ?? (next.state === 'blocked' ? next.text : undefined)
  const waits = next.wait ? (next.wait.release ? `${next.wait.summary} — ${next.wait.release}` : next.wait.summary) : next.state === 'waiting' ? next.text : undefined
  const why = stuck ?? waits ?? held
  const box = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px', borderRadius: 6, background: C.raised, color: C.text2, fontSize: 12, lineHeight: '18px', fontVariantNumeric: 'tabular-nums' }
  return h('section', { 'data-testid': 'awr-nextstep', style: { marginTop: 20, padding: '16px 18px', border: `.5px solid ${C.line2}`, borderRadius: 12, background: C.surface } },
    h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 } },
      h('div', { style: P.label }, t('step.title')),
      next.changedAt ? h('div', { 'data-testid': 'awr-nextstep-when', title: clock(next.changedAt), style: { fontSize: 12, lineHeight: '16px', color: C.faint, fontVariantNumeric: 'tabular-nums', flex: 'none' } }, ago(next.changedAt, t)) : null),
    h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8 } },
      h('span', { style: { marginTop: 6, flex: 'none' } }, h(Light, { state: next.state })),
      h('button', { type: 'button', id: 'awr-nextstep-open', className: 'awr-link', style: { textAlign: 'left', fontSize: 16, lineHeight: '24px', fontWeight: 500, color: C.text }, onClick: () => onPick(next.key) },
        next.headline ?? h('span', { className: 'awr-clamp2' }, next.text))),
    links.length
      ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6, paddingLeft: 19 } },
        ...links.map((link) => h('a', { key: link, href: link, target: '_blank', rel: 'noreferrer', title: link, style: { fontSize: 12, lineHeight: '18px', color: C.text2, overflowWrap: 'anywhere' } }, link.replace(/^https?:\/\//, ''))))
      : null,
    h('div', { style: { marginTop: 12 } }, h('div', { style: P.label }, stuck ? t('step.blocked') : waits ? t('step.wait') : t('step.why'))),
    h('div', { 'data-testid': 'awr-nextstep-why', style: { display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 4, fontSize: 13, lineHeight: '20px', color: stuck ? C.warn : C.text2 } },
      h('span', { style: { minWidth: 0 } }, why),
      stuck || waits ? null : h('span', { title: next.claimedBy || next.claimed ? undefined : t('step.unheld.tip'), style: { color: C.faint, cursor: 'help' } }, 'ⓘ')),
    notPercent
      ? h('div', { title: notPercent, style: { marginTop: 8, padding: '6px 8px', borderRadius: 6, background: C.code, color: C.text3, fontFamily: C.mono, fontSize: 11, lineHeight: '16px', overflowWrap: 'anywhere' } }, notPercent)
      : null,
    h('div', { style: P.rule }),
    h('div', { style: P.label }, t('step.facts')),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 } }, ...chips.map((chip) => h('span', { key: chip.key, title: chip.tip, style: box }, chip.text))),
    checklist.length
      ? h('div', { style: { marginTop: 10 } },
        h('div', { style: { ...P.label, marginBottom: 4 }, title: t('tip.acceptance') }, t('step.checklist')),
        h('ul', { style: { margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 } },
          ...checklist.map((item) => h('li', { key: item, style: { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, lineHeight: '20px', color: C.text2 } },
            h('span', { 'data-check': 'unmarked', style: { width: 10, height: 10, flex: 'none', marginTop: 5, borderRadius: 2, border: `.5px solid ${C.faint}` } }),
            h('span', { style: { minWidth: 0 } }, item)))),
        h('div', { style: { marginTop: 6, fontSize: 12, lineHeight: '18px', color: C.faint } }, t('step.checklist.unmarked')))
      : h('div', { style: { marginTop: 10, fontSize: 12, lineHeight: '18px', color: C.text3 } }, t('step.checklist.none')),
    next.headline && next.headline !== next.text
      ? h('div', { style: { marginTop: 12 } }, h(Fold, { label: t('step.whole') }, h('div', { style: { fontSize: 13, lineHeight: '20px', color: C.text2, overflowWrap: 'anywhere' } }, next.text)))
      : null,
    guidance
      ? h('div', { style: { marginTop: 12, paddingTop: 10, borderTop: `.5px solid ${C.line}`, fontSize: 12, lineHeight: '18px', color: C.text3, display: 'grid', gap: 2 } },
        h('div', { 'data-testid': 'awr-nextstep-basis' }, t('step.basis', { basis: guidance.basis })),
        guidance.when || guidance.recheck
          ? h('div', null, [guidance.when ? t('step.when', { when: guidance.when }) : undefined, guidance.recheck ? t('step.recheck', { recheck: guidance.recheck }) : undefined].filter(Boolean).join(' · '))
          : null)
      : null)
}

/**
 * What needs the person: work that is stuck, and goals nobody confirmed. Three at first, the rest on request.
 * A section that is empty says so out loud — a vanished section is read as good news, an honest line is read as fact.
 */
function Needs({ items, t, onPick }) {
  const [all, setAll] = React.useState(false)
  const shown = all ? items : items.slice(0, 3)
  return h('div', { 'data-testid': 'awr-page-needs', style: { marginTop: 24 } },
    h('div', { style: { fontSize: 13, lineHeight: '20px', fontWeight: 500, color: C.text } }, t('needs.title'), h('span', { style: { marginLeft: 6, color: C.text3, fontWeight: 400, fontVariantNumeric: 'tabular-nums' } }, items.length)),
    h('div', { style: { marginTop: 4, borderTop: `.5px solid ${C.line2}` } },
      ...(items.length ? shown.map((item, index) => h(item.key ? 'button' : 'div', {
        key: `${item.kind}:${item.key ?? index}`,
        ...(item.key ? { type: 'button', className: 'awr-link', onClick: () => onPick(item.key) } : {}),
        style: { display: 'flex', alignItems: 'baseline', gap: 8, width: '100%', padding: '8px 0', borderBottom: `.5px solid ${C.line2}`, borderRadius: 0, fontSize: 13, lineHeight: '20px', color: C.text },
      },
      h('span', { style: { transform: 'translateY(-1px)' } }, h(Light, { state: item.kind === 'blocked' ? 'blocked' : 'waiting' })),
      h('span', { style: { minWidth: 0, flex: 1 } },
        h('span', { className: 'awr-clamp1', style: { display: 'block' } }, item.title),
        h('span', { className: 'awr-clamp2', style: { fontSize: 12, lineHeight: '18px', color: C.text3 } }, item.kind === 'blocked' ? (item.detail || t('needs.blocked')) : item.kind === 'setup' ? item.detail : t('needs.goal')))))
        : [h('div', { key: 'none', 'data-testid': 'awr-needs-none', style: { padding: '8px 0', ...P.note } }, t('needs.none'))])),
    items.length > 3 ? h('button', { type: 'button', className: 'awr-btn awr-btn-quiet', style: { margin: '4px 0 0 -8px', fontSize: 12 }, onClick: () => setAll(!all) }, all ? t('needs.less') : t('needs.more', { n: items.length - 3 })) : null)
}

/**
 * Who has their hands on the work right now (DSH-079 P1). AWR knows a session is open and which work it claimed; it does
 * not know what a person is doing this second, so the strip says whose turn it is, since when, and nothing else. A session
 * that claimed nothing is named as one instead of being left out, because a missing row reads as nobody working.
 */
function Working({ working, t, onPick }) {
  const [all, setAll] = React.useState(false)
  const items = working?.items ?? []
  const shown = all ? items : items.slice(0, 3)
  return h('div', { 'data-testid': 'awr-page-working', style: { marginTop: 24 } },
    h('div', { style: { fontSize: 13, lineHeight: '20px', fontWeight: 500, color: C.text } },
      h('span', { title: t('tip.working') }, t('working.title')),
      h('span', { style: { marginLeft: 6, color: C.text3, fontWeight: 400, fontVariantNumeric: 'tabular-nums' } }, t('working.count', { n: items.length }))),
    h('div', { style: { marginTop: 4, borderTop: `.5px solid ${C.line2}` } },
      ...(items.length ? shown.map((item, index) => h(item.key ? 'button' : 'div', {
        key: index,
        ...(item.key ? { type: 'button', className: 'awr-link', onClick: () => onPick(item.key) } : {}),
        title: [item.title, item.model, Number.isFinite(item.startRevision) ? t('working.since', { rev: item.startRevision }) : undefined].filter(Boolean).join(' · '),
        style: { display: 'flex', alignItems: 'baseline', gap: 8, width: '100%', padding: '8px 0', borderBottom: `.5px solid ${C.line2}`, borderRadius: 0, fontSize: 13, lineHeight: '20px', color: C.text },
      },
      h(Icon, { name: 'node', size: 12 }),
      h('span', { className: 'awr-clamp1', style: { minWidth: 0, flex: 1, textAlign: 'left' } }, item.title ?? t('working.unclaimed')),
      item.model ? h('span', { className: 'awr-clamp1', style: { fontSize: 12, color: C.text3, maxWidth: 140 } }, item.model) : null,
      Number.isFinite(item.startedAt) ? h('span', { style: { fontSize: 12, color: C.faint, flex: 'none', fontVariantNumeric: 'tabular-nums' } }, ago(item.startedAt, t)) : null))
        : [h('div', { key: 'none', 'data-testid': 'awr-working-none', style: { padding: '8px 0', ...P.note } }, t('working.empty'))]),
      items.length > 3 ? h('button', { type: 'button', className: 'awr-btn awr-btn-quiet', style: { margin: '4px 0 0 -8px', fontSize: 12 }, 'aria-expanded': all, onClick: () => setAll(!all) }, all ? t('needs.less') : t('working.more', { n: items.length - 3 })) : null,
      // Its own sentence: a session window may be short in a different way than an event read is.
      working?.mayHaveMore ? h('div', { style: { ...P.note, marginTop: 4 } }, t('working.may.more')) : null)
  )
}

/**
 * What the ledger recorded (DSH-079 P1), newest first, in AWR's own words — they are not translated because they are a
 * record, not copy. A read that came back with nothing says so, and a page whose awr will not hand the events over says
 * that instead, because a quiet block is read as a project that did nothing.
 */
function LedgerEvents({ activity, byKey, t, onPick }) {
  const [all, setAll] = React.useState(false)
  const items = activity?.items ?? []
  const shown = all ? items : items.slice(0, 5)
  return h('section', { 'data-testid': 'awr-activity', style: { marginTop: 40 } },
    h('div', { style: { fontSize: 13, lineHeight: '20px', fontWeight: 500, color: C.text } },
      h('span', { title: t('tip.activity') }, t('activity.title')),
      h('span', { style: { marginLeft: 6, color: C.text3, fontWeight: 400, fontVariantNumeric: 'tabular-nums' } }, t('activity.count', { n: items.length }))),
    h('div', { style: { marginTop: 4, borderTop: `.5px solid ${C.line2}` } },
      ...(items.length ? shown.map((event, index) => h('div', {
        key: index,
        style: { display: 'flex', alignItems: 'baseline', gap: 8, padding: '8px 0', borderBottom: `.5px solid ${C.line2}`, fontSize: 13, lineHeight: '20px', color: C.text2 },
      },
      h('span', { style: { fontSize: 12, color: C.faint, flex: 'none', fontVariantNumeric: 'tabular-nums' }, title: Number.isFinite(event.at) ? clock(event.at) : undefined }, Number.isFinite(event.at) ? ago(event.at, t) : '—'),
      h('span', { className: 'awr-clamp1', style: { minWidth: 0, flex: 1 } }, event.summary ?? event.kind),
      // Which piece of work it is about, in that work's own words; its key stays in the tooltip like everywhere else.
      event.key && byKey?.has(event.key) ? h('button', { type: 'button', className: 'awr-link', style: { fontSize: 12, flex: 'none', maxWidth: 160 }, title: event.key, onClick: () => onPick(event.key) },
        h('span', { className: 'awr-clamp1' }, byKey.get(event.key).title)) : null))
        : [h('div', { key: 'none', 'data-testid': 'awr-activity-none', style: { padding: '8px 0', ...P.note } }, activity ? t('activity.empty') : t('activity.unread'))]),
      items.length > 5 ? h('button', { type: 'button', className: 'awr-btn awr-btn-quiet', style: { margin: '4px 0 0 -8px', fontSize: 12 }, 'aria-expanded': all, onClick: () => setAll(!all) }, all ? t('activity.less') : t('activity.open')) : null,
      activity?.truncated ? h('div', { style: { ...P.note, marginTop: 4 } }, t('activity.more')) : null)
  )
}

/** The details of one piece of work, in plain words; its identifiers are folded at the end. */
function Detail({ node, byKey, t, onPick, onClaim, onClose }) {
  const [claiming, setClaiming] = React.useState(false)
  const section = (label, body) => h('div', { style: { marginTop: 16 } }, h('div', { style: { fontSize: 12, lineHeight: '16px', color: C.text3, marginBottom: 4 } }, label), body)
  const links = (keys) => h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
    ...keys.filter((key) => byKey.has(key)).map((key) => {
      const other = byKey.get(key)
      return h('button', { key, type: 'button', className: 'awr-link', style: { display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13, lineHeight: '20px', color: C.text2 }, onClick: () => onPick(key) },
        h('span', { style: { transform: 'translateY(-1px)' } }, h(Light, { state: other.state })), h('span', { className: 'awr-clamp2', style: { minWidth: 0 } }, other.title))
    }))
  const strong = node.state === 'active' || node.state === 'blocked' || node.state === 'waiting'
  return h('aside', { 'data-testid': 'awr-detail', 'aria-label': node.title, className: 'awr-drawer', style: { flex: 'none', width: 320, maxWidth: '100%', boxSizing: 'border-box', alignSelf: 'flex-start', position: 'sticky', top: 16, maxHeight: 'calc(100vh - 280px)', minHeight: 160, overflow: 'auto', padding: 16, border: `.5px solid ${C.line2}`, borderRadius: 'var(--dsw-radius-md, 12px)', background: C.surface } },
    h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 } },
      h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 28, fontSize: 12, lineHeight: '16px', color: strong ? STATE_COLOR[node.state] : C.text3 } }, h(Light, { state: node.state }), t(`state.${node.state}`), node.claimed ? h('span', { style: { color: C.text3 } }, `· ${t('detail.claimed')}`) : null),
      h('button', { type: 'button', className: 'awr-btn awr-btn-icon', style: { margin: '0 -4px 0 0' }, title: t('detail.close'), 'aria-label': t('detail.close'), onClick: onClose }, h(Icon, { name: 'x', size: 14 }))),
    h('div', { style: { marginTop: 4, fontSize: 15, lineHeight: '22px', fontWeight: 500, color: C.text, wordBreak: 'break-word' } }, node.title),
    node.blocker ? section(t('detail.blocker'), h('div', { style: { fontSize: 13, lineHeight: '20px', color: C.bad, wordBreak: 'break-word' } }, node.blocker)) : null,
    // Why AWR says it waits, in AWR's own words, with the condition that would release it.
    node.wait ? section(t('detail.wait'), h('div', { style: { fontSize: 13, lineHeight: '20px', color: C.text2, wordBreak: 'break-word' } }, node.wait.summary,
      node.wait.release ? h('div', { style: { marginTop: 4, fontSize: 12, lineHeight: '18px', color: C.text3 } }, `${t('detail.wait.release')}：${node.wait.release}`) : null)) : null,
    node.next ? section(t('detail.next'), h('div', { style: { fontSize: 13, lineHeight: '20px', color: C.text, wordBreak: 'break-word' } }, node.next)) : null,
    node.outcomes?.length ? section(h('span', { title: t('tip.acceptance') }, t('detail.outcomes')), h('ul', { style: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 } },
      ...node.outcomes.map((outcome, index) => h('li', { key: index, style: { display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13, lineHeight: '20px', color: C.text2 } },
        h('span', { style: { flex: 'none', width: 8, height: 8, boxSizing: 'border-box', borderRadius: 2, border: `1.5px solid ${node.state === 'done' ? C.text3 : C.faint}`, background: node.state === 'done' ? C.text3 : 'transparent', transform: 'translateY(-1px)' } }),
        h('span', { style: { minWidth: 0, wordBreak: 'break-word' } }, outcome))))) : null,
    node.dependsOn?.some((key) => byKey.has(key)) ? section(t('detail.depends'), links(node.dependsOn)) : null,
    node.unlocks?.some((key) => byKey.has(key)) ? section(t('detail.unlocks'), links(node.unlocks)) : null,
    // Ready work can really be taken: the button runs the plugin's own claim command in this conversation.
    node.state === 'ready' ? section(t('detail.take'), h('button', {
      type: 'button', className: 'awr-btn awr-btn-soft', 'id': 'awr-detail-claim', disabled: claiming,
      onClick: async () => { setClaiming(true); try { await onClaim(node.key) } finally { setClaiming(false) } },
    }, claiming ? t('detail.take.busy') : t('detail.take.run'))) : null,
    h('div', { style: { marginTop: 16, paddingTop: 12, borderTop: `.5px solid ${C.line2}` } },
      h(Fold, { label: t('tech.title'), testId: 'awr-detail-tech' },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
          h(Fact, { label: t('tech.work'), value: node.tech?.key }),
          h(Fact, { label: t('tech.source'), value: [node.tech?.source, node.tech?.where].filter(Boolean).join(' ') })))))
}

/** By mainline: each with how far it is, the work that is left as cards, and the finished work folded. */
function LinesView({ lanes, nodes, t, strip, selected, matches, showDone, laneFilter, onLane, onClear, onPick }) {
  const [open, setOpen] = React.useState({})
  const groups = lanes.map((lane) => {
    const own = nodes.filter((node) => node.lane === lane.id && matches(node)).sort(byState)
    return { lane, left: own.filter((node) => node.state !== 'done'), done: own.filter((node) => node.state === 'done') }
  }).filter((group) => group.left.length || group.done.length)
  const active = groups.filter((group) => group.left.length)
  const finished = groups.filter((group) => !group.left.length)
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(208px, 1fr))', gap: 8 }
  const renderGroup = ({ lane, left, done }) => {
    const all = open[lane.id] === true
    const cards = all ? left : left.slice(0, 8)
    const doneOpen = showDone || open[`${lane.id}:done`] === true
    return h('section', { key: lane.id, 'data-lane': lane.id, style: { marginBottom: 24 } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 } },
        h('button', { type: 'button', className: 'awr-legend', 'data-lane-chip': lane.id, 'aria-pressed': laneFilter === lane.id, ...(laneFilter && laneFilter !== lane.id ? { 'data-off': 'true' } : {}), title: `${laneTitle(lane.id, t, strip)} · ${t('lane.chip.tip')}`, style: { padding: '0 0 0 8px', margin: '0 0 0 -8px', fontSize: 14, lineHeight: '20px', fontWeight: 500, color: C.text }, onClick: () => onLane?.(lane.id) }, laneTitle(lane.id, t, strip)),
        h('span', { style: { flex: 'none', width: 72, height: 4, borderRadius: 2, background: C.active, overflow: 'hidden' } }, h('span', { style: { display: 'block', width: `${lane.total ? (lane.done / lane.total) * 100 : 0}%`, height: '100%', background: C.text } })),
        h('span', { title: t('tip.lane'), style: { fontSize: 12, lineHeight: '16px', color: C.text3, fontVariantNumeric: 'tabular-nums' } }, lane.done === lane.total ? t('lane.alldone') : `${lane.done} / ${lane.total}`)),
      cards.length ? h('div', { style: grid }, ...cards.map((node) => h(WorkCard, { key: node.key, node, t, selected: selected === node.key, onPick }))) : null,
      h('div', { style: { display: 'flex', gap: 4, margin: '4px 0 0 -8px' } },
        left.length > 8 ? h('button', { type: 'button', className: 'awr-btn awr-btn-quiet', style: { fontSize: 12 }, onClick: () => setOpen({ ...open, [lane.id]: !all }) }, all ? t('needs.less') : t('lane.more', { n: left.length - 8 })) : null,
        done.length && !showDone ? h('button', { type: 'button', className: 'awr-btn awr-btn-quiet', 'data-done-toggle': lane.id, style: { fontSize: 12 }, 'aria-expanded': doneOpen, onClick: () => setOpen({ ...open, [`${lane.id}:done`]: !doneOpen }) }, h(Icon, { name: 'check', size: 12 }), t('lane.done', { n: done.length })) : null),
      doneOpen && done.length ? h('div', { style: { ...grid, marginTop: 8 } }, ...done.map((node) => h(WorkCard, { key: node.key, node, t, selected: selected === node.key, onPick }))) : null)
  }
  if (!groups.length) return h(EmptyState, { kind: 'filtered', dense: true, action: onClear, t })
  const finishedOpen = showDone || open['~finished'] === true || !active.length
  return h('div', { 'data-testid': 'awr-view-lines' },
    ...active.map(renderGroup),
    finished.length && active.length && !showDone ? h('button', { type: 'button', className: 'awr-btn awr-btn-quiet', style: { margin: '0 0 16px -8px', fontSize: 12 }, 'aria-expanded': finishedOpen, onClick: () => setOpen({ ...open, '~finished': !finishedOpen }) }, h(Icon, { name: 'check', size: 12 }), t('lane.finished', { n: finished.length })) : null,
    ...(finishedOpen ? finished.map(renderGroup) : []))
}

/** A canvas of cards and the lines between them, with the chain of the card under the pointer picked out. */
function Canvas({ layout, nodes, t, selected, matches, zoom, onPick, header }) {
  const [hot, setHot] = React.useState(undefined)
  const shown = React.useMemo(() => new Map(nodes.map((node) => [node.key, node])), [nodes])
  const focus = hot ?? selected
  // A card with nothing before or after it has no chain to pick out, so nothing is dimmed for it.
  const chain = React.useMemo(() => {
    const found = focus && shown.has(focus) ? chainOf(focus, shown) : undefined
    return found && found.size > 1 ? found : undefined
  }, [focus, shown])
  return h('div', { style: { width: layout.width * zoom, height: layout.height * zoom } },
    h('div', { style: { position: 'relative', width: layout.width, height: layout.height, transform: `scale(${zoom})`, transformOrigin: '0 0' } },
      h('svg', { width: layout.width, height: layout.height, style: { position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }, 'aria-hidden': true },
        ...layout.edges.map((edge) => {
          const inChain = chain ? chain.has(edge.from) && chain.has(edge.to) : false
          return h('path', { key: edge.id, d: edge.d, className: 'awr-edge', 'data-edge': edge.id, 'data-hot': inChain ? 'true' : undefined, 'data-dim': chain && !inChain ? 'true' : undefined, 'data-soft': edge.cross ? 'true' : undefined })
        })),
      header,
      ...nodes.filter((node) => layout.place.has(node.key)).map((node) => h(WorkCard, { key: node.key, node, t, fixed: layout.place.get(node.key), selected: selected === node.key, dim: !matches(node) || (chain ? !chain.has(node.key) : false), onPick, onHover: setHot }))))
}

function GraphView({ nodes, t, selected, matches, zoom, onPick }) {
  const layout = React.useMemo(() => graphLayout(nodes), [nodes])
  const loose = layout.loose.filter(matches).sort(byState)
  if (!nodes.length) return h('p', { style: { margin: '32px 0', fontSize: 13, color: C.text3 } }, t('empty.alldone'))
  return h('div', { 'data-testid': 'awr-view-graph' },
    layout.linked.length ? h('div', { style: { overflowX: 'auto', padding: '4px 0 16px' } }, h(Canvas, { layout, nodes: layout.linked, t, selected, matches, zoom, onPick })) : null,
    loose.length ? h('div', { style: { marginTop: layout.linked.length ? 16 : 0 } },
      layout.linked.length ? h('div', { style: { fontSize: 12, lineHeight: '16px', color: C.text3, marginBottom: 8 } }, t('graph.loose'), h('span', { style: { marginLeft: 6, fontVariantNumeric: 'tabular-nums' } }, loose.length)) : null,
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(208px, 1fr))', gap: 8 } }, ...loose.map((node) => h(WorkCard, { key: node.key, node, t, selected: selected === node.key, onPick })))) : null)
}

function LanesView({ nodes, lanes, t, strip, selected, matches, zoom, laneFilter, onLane, onPick }) {
  const layout = React.useMemo(() => lanesLayout(nodes, lanes), [nodes, lanes])
  if (!nodes.length) return h('p', { style: { margin: '32px 0', fontSize: 13, color: C.text3 } }, t('empty.alldone'))
  const header = layout.columns.map((column, index) => h('div', { key: column.lane.id, 'data-lane-head': column.lane.id, style: { position: 'absolute', left: index * (CARD_W + LANE_GAP), top: 0, width: CARD_W, height: LANE_HEAD - 12, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, borderBottom: `.5px solid ${C.line2}` } },
    h('button', { type: 'button', className: 'awr-legend', 'data-lane-chip': column.lane.id, 'aria-pressed': laneFilter === column.lane.id, ...(laneFilter && laneFilter !== column.lane.id ? { 'data-off': 'true' } : {}), title: `${laneTitle(column.lane.id, t, strip)} · ${t('lane.chip.tip')}`, style: { minWidth: 0, padding: '0 0 0 8px', margin: '0 0 0 -8px', fontSize: 13, lineHeight: '20px', fontWeight: 500, color: C.text }, onClick: () => onLane?.(column.lane.id) }, h('span', { className: 'awr-clamp1' }, laneTitle(column.lane.id, t, strip))),
    h('span', { title: t('tip.lane'), style: { flex: 'none', fontSize: 12, lineHeight: '16px', color: C.text3, fontVariantNumeric: 'tabular-nums' } }, `${column.lane.done} / ${column.lane.total}`)))
  return h('div', { 'data-testid': 'awr-view-lanes', style: { overflowX: 'auto', padding: '4px 0 16px 16px' } }, h(Canvas, { layout, nodes, t, selected, matches, zoom, onPick, header }))
}

/**
 * AWR starts no work while the project is incomplete (its goal, the acceptance and next steps of its work), whatever its
 * dependency graph says; so work the graph calls ready is not ready to start yet, and the page says it is not started.
 */
function holdReady(progress, organization) {
  if (progress?.ok !== true || organization?.ready !== false || !(progress.counts?.ready > 0)) return progress
  return {
    ...progress,
    counts: { ...progress.counts, ready: 0, planned: (progress.counts.planned ?? 0) + progress.counts.ready },
    nodes: progress.nodes.map((node) => (node.state === 'ready' ? { ...node, state: 'planned' } : node)),
  }
}

function ProgressPage(props) {
  const ctx = props.__ctx
  const sessionId = props.sessionId
  const t = React.useMemo(() => translator(ctx), [ctx])
  const project = useProjectState(ctx, sessionId, t, true)
  const view = project.data?.view
  const managed = Boolean(view && (view.state === 'initialized' || view.state === 'completed'))
  const { progress: reported, error, working, ask } = useProgress(ctx, sessionId, project.language, managed)
  const organization = project.data?.work?.organization
  const progress = React.useMemo(() => holdReady(reported, organization), [reported, organization])
  const [mode, setMode] = React.useState('lines')
  const [selected, setSelected] = React.useState(undefined)
  const [query, setQuery] = React.useState('')
  const [only, setOnly] = React.useState(undefined)
  const [laneFilter, setLaneFilter] = React.useState(undefined)
  const [showDone, setShowDone] = React.useState(false)
  const [zoom, setZoom] = React.useState(1)
  const [failure, setFailure] = React.useState(undefined)
  const [installing, setInstalling] = React.useState(false)
  const area = React.useRef(null)

  React.useEffect(() => {
    if (!selected) return undefined
    const close = (event) => { if (event.key === 'Escape') setSelected(undefined) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [selected])

  const ok = progress?.ok === true
  const all = React.useMemo(() => (ok ? progress.nodes.filter((node) => node.state !== 'cancelled') : []), [ok, progress])
  const byKey = React.useMemo(() => new Map(all.map((node) => [node.key, node])), [all])
  const lanes = ok ? progress.lanes : []
  const strip = React.useMemo(() => sharedPrefix(lanes), [lanes])
  // Finished work is folded away unless asked for, or unless the legend is asking for exactly that.
  const visible = React.useMemo(() => all.filter((node) => showDone || only === 'done' || node.state !== 'done'), [all, showDone, only])
  const needle = query.trim().toLowerCase()
  const matches = React.useCallback((node) => (!only || node.state === only) && (!laneFilter || node.lane === laneFilter) && (!needle || node.title.toLowerCase().includes(needle) || String(node.key).toLowerCase().includes(needle)), [only, laneFilter, needle])

  // A filter that empties the page has to be escapable without hunting for the control that set it.
  const clearFilters = () => {
    setOnly(undefined)
    setLaneFilter(undefined)
    setQuery('')
    setShowDone(false)
  }

  const start = async () => {
    setFailure(undefined)
    try {
      await project.act('/awr takeover')
    } catch (problem) {
      setFailure(String(problem?.message ?? problem))
    }
  }
  // The machine's awr is too old for this page: install the bundled one and bind the project to it, then
  // the page reads again (the command republishes the page's data; this read is the belt to its braces).
  const installRuntime = async () => {
    setFailure(undefined)
    setInstalling(true)
    try {
      await project.act('/awr runtime install --use')
      await ask(false)
    } catch (problem) {
      setFailure(String(problem?.message ?? problem))
    } finally {
      setInstalling(false)
    }
  }
  // The three views are tabs: one stop in the Tab order, the arrow keys (and Home and End) move between them.
  const stepMode = (event) => {
    const at = MODES.indexOf(mode)
    const to = { ArrowRight: (at + 1) % MODES.length, ArrowLeft: (at + MODES.length - 1) % MODES.length, Home: 0, End: MODES.length - 1 }[event.key]
    if (to === undefined) return
    event.preventDefault()
    setMode(MODES[to])
    event.currentTarget?.parentElement?.children?.[to]?.focus?.()
  }
  const fit = () => {
    const width = area.current?.clientWidth
    const natural = mode === 'graph' ? graphLayout(visible).width : lanesLayout(visible, lanes).width
    if (width && natural) setZoom(Math.max(0.3, Math.min(1, Math.floor((width / natural) * 20) / 20)))
  }
  // Entering a canvas view fits the whole chain in the window, so the end of it is never off-screen.
  // Hosts without a browser frame clock (tests, embedders) fall back to a timer.
  React.useEffect(() => {
    if (mode === 'lines') return undefined
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16)
    const caf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : (id) => clearTimeout(id)
    const frame = raf(fit)
    return () => caf(frame)
  }, [mode, visible.length])

  // Taking ready work is the plugin's own command, run in this conversation.
  const claim = async (key) => {
    try {
      await project.act(`/awr claim ${key}`)
    } catch {
      // The host shows the reason; the button just becomes pressable again.
    }
  }

  const frame = (children) => h('div', { 'data-testid': 'awr-page', style: { height: '100%', overflow: 'auto', boxSizing: 'border-box', color: C.text, fontSize: 13, lineHeight: '20px' } }, children)
  const center = (children) => frame(h('div', { style: { maxWidth: 420, margin: '0 auto', padding: '72px 24px 200px' } }, children))

  if (!view) {
    return center(project.error
      ? h('div', { 'data-testid': 'awr-page-error' }, h('p', { style: P.title }, t('pop.error.title')), h('div', { style: { marginTop: 12 } }, h('button', { type: 'button', className: 'awr-btn awr-btn-soft', onClick: project.refresh }, t('pop.error.retry'))), h('div', { style: { marginTop: 12 } }, h(Fold, { label: t('tech.title') }, h('div', { style: { fontSize: 12, lineHeight: '18px', color: C.text2, wordBreak: 'break-word' } }, project.error))))
      : h('p', { style: { ...P.body, color: C.text3 } }, t('page.loading')))
  }
  if (!managed) return center(h(TakeoverBlock, { view, t, busy: project.busy, onStart: start, failure }))
  if (!progress) return center(h('p', { style: { ...P.body, color: C.text3 } }, error ? t('empty.failed.title') : t('page.loading')))
  if (!ok) {
    const known = progress.reason === 'unsupported'
    // The bundled awr the page offers instead of stopping (DSH-067): install it (or bind the project to the
    // copy that is already installed), and the page draws with it.
    const installer = known ? progress.installer : undefined
    const offered = installer && installer.state !== 'unsupported'
    return center(h('div', { 'data-testid': 'awr-page-empty', 'data-reason': progress.reason },
      h('p', { style: P.title }, known ? t('empty.unsupported.title') : t('empty.failed.title')),
      known ? h('p', { style: P.body }, t('empty.unsupported.body')) : null,
      h('div', { style: { marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 } },
        h('button', { type: 'button', className: 'awr-btn awr-btn-soft', disabled: Boolean(working) || installing, onClick: () => ask(false) }, t('empty.failed.retry')),
        offered
          ? h('button', { id: 'awr-page-runtime-install', 'data-testid': 'awr-page-runtime-install', type: 'button', className: 'awr-btn awr-btn-primary', disabled: installing, onClick: installRuntime },
              installing ? t('runtime.installing') : installer.state === 'installed' ? t('page.runtime.use', { version: installer.version }) : t('page.runtime.install', { version: installer.check?.latest ?? '' }))
          : null),
      failure ? h('p', { style: { ...P.note, color: C.bad }, 'data-testid': 'awr-page-failure' }, failure) : null,
      progress.message ? h('div', { style: { marginTop: 12 } }, h(Fold, { label: t('tech.title') }, h('div', { style: { fontSize: 12, lineHeight: '18px', color: C.text2, wordBreak: 'break-word' } }, progress.message))) : null))
  }

  const goals = progress.goals ?? []
  const goal = goals.find((item) => item.status === 'active') ?? goals[0]
  const node = selected ? byKey.get(selected) : undefined
  const pick = (key) => setSelected(key === selected ? undefined : key)
  const graphish = mode !== 'lines'
  const inset = 'clamp(24px, 4vw, 48px)'
  const pickLane = (id) => setLaneFilter(laneFilter === id ? undefined : id)
  // Every filter that is on gets named where it can be seen, with the way out of it: a page narrowed by a chip
  // nobody can see reads as a project that shrank (DSH-079).
  const filters = []
  if (only) filters.push({ key: 'state', label: t(`state.${only}`), clear: () => setOnly(undefined) })
  if (laneFilter) filters.push({ key: 'lane', label: t('step.lane', { id: laneTitle(laneFilter, t, strip) }), clear: () => setLaneFilter(undefined) })
  if (needle) filters.push({ key: 'query', label: t('filter.query', { q: query.trim() }), clear: () => setQuery('') })
  if (showDone) filters.push({ key: 'done', label: t('tools.done'), clear: () => setShowDone(false) })
  const filterBar = filters.length
    ? h('div', { 'data-testid': 'awr-filters', style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, margin: '20px 0 12px -8px' } },
        h('span', { 'data-testid': 'awr-filters-count', style: { ...P.note, margin: 0, marginRight: 4 } }, t('filter.shown', { shown: visible.filter(matches).length, total: all.length })),
        ...filters.map((item) => h('button', { key: item.key, type: 'button', className: 'awr-legend', 'data-filter': item.key, 'aria-pressed': true, title: t('filter.clear.one'), onClick: item.clear }, item.label, h(Icon, { name: 'x', size: 11 }))),
        h('button', { type: 'button', className: 'awr-btn awr-btn-quiet', 'data-testid': 'awr-filters-clear', style: { fontSize: 12 }, onClick: clearFilters }, t('filter.clear')))
    : null

  return frame(h('div', { style: { maxWidth: 1280, margin: '0 auto', padding: `28px ${inset} 200px` } },
    h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 } },
      h('div', { style: { minWidth: 0 } },
        h('h1', { style: { margin: 0, fontSize: 20, lineHeight: '28px', fontWeight: 500, color: C.text } }, t('page.title')),
        h('div', { className: 'awr-clamp1', style: { marginTop: 2, fontSize: 13, lineHeight: '20px', color: C.text3 } },
          [progress.project || baseName(view.projectRoot), goal ? `${t('page.goal', { title: goal.title })}${goals.length > 1 ? t('page.goals.more', { n: goals.length - 1 }) : ''}` : undefined].filter(Boolean).join(' · '))),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 4, flex: 'none' } },
        h('span', { 'data-testid': 'awr-updated', title: t('tip.updated'), style: { marginRight: 4, fontSize: 12, lineHeight: '16px', color: C.text3, fontVariantNumeric: 'tabular-nums' } }, working === 'sync' ? t('page.syncing') : t('page.updated', { time: clock(progress.updatedAt) })),
        h('button', { id: 'awr-page-refresh', type: 'button', className: 'awr-btn awr-btn-icon', title: t('page.refresh'), 'aria-label': t('page.refresh'), disabled: Boolean(working), onClick: () => ask(false) }, h(Icon, { name: 'refresh', size: 14, className: working ? 'awr-spin' : undefined })),
        h('button', { id: 'awr-page-sync', type: 'button', className: 'awr-btn awr-btn-quiet', disabled: Boolean(working), onClick: () => ask(true) }, t('page.sync')))),

    h(SourceIssues, { issues: progress.sourceIssues, t }),
    all.length === 0
      ? h(EmptyState, { kind: progress.sourceIssues ? 'broken' : 'none', testid: 'awr-page-empty', reason: progress.sourceIssues ? 'sourcebroken' : 'nowork', t })
      : h(React.Fragment, null,
          h(GoalBand, { progress, nodes: all, t, onPick: (key) => setSelected(key) }),
          h(NextStep, { next: progress.next, guidance: progress.guidance, accounting: progress.accounting, counts: progress.counts, t, onPick: (key) => setSelected(key) }),
          h(Working, { working: progress.working, t, onPick: (key) => setSelected(key) }),
          h('div', { style: { marginTop: 24 } }, h(Gauge, { counts: progress.counts, t, only, onOnly: setOnly })),
          h(Needs, { items: [...(organization?.ready === false ? [{ kind: 'setup', title: t('needs.setup.title'), detail: t('needs.setup', { n: organization.gaps ?? 0 }) }] : []), ...(progress.attention ?? [])], t, onPick: (key) => setSelected(key) }),

          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, margin: '32px 0 16px' } },
            h('div', { role: 'tablist', className: 'awr-seg', 'aria-label': t('page.title') },
              ...MODES.map((name) => h('button', { key: name, type: 'button', role: 'tab', id: `awr-mode-${name}`, 'aria-selected': mode === name, tabIndex: mode === name ? 0 : -1, onClick: () => setMode(name), onKeyDown: stepMode }, t(`views.${name}`)))),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              h('label', { style: { position: 'relative', display: 'block', width: 200 } },
                h('span', { style: { position: 'absolute', left: 8, top: 7, color: C.faint, display: 'inline-flex' } }, h(Icon, { name: 'search', size: 14 })),
                h('input', { id: 'awr-search', type: 'search', className: 'awr-input', value: query, placeholder: t('tools.search'), 'aria-label': t('tools.search'), onChange: (event) => setQuery(event.target.value) })),
              h('button', { id: 'awr-show-done', type: 'button', className: `awr-btn awr-btn-quiet${showDone ? ' awr-btn-on' : ''}`, 'aria-pressed': showDone, onClick: () => setShowDone(!showDone) }, h(Icon, { name: 'check', size: 14 }), t('tools.done')),
              graphish ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 2 } },
                h('button', { type: 'button', className: 'awr-btn awr-btn-icon', title: t('tools.zoom.out'), 'aria-label': t('tools.zoom.out'), disabled: zoom <= 0.3, onClick: () => setZoom(Math.max(0.3, Math.round((zoom - 0.1) * 10) / 10)) }, h(Icon, { name: 'minus', size: 14 })),
                h('span', { 'data-testid': 'awr-zoom', style: { width: 40, textAlign: 'center', fontSize: 12, color: C.text3, fontVariantNumeric: 'tabular-nums' } }, `${Math.round(zoom * 100)}%`),
                h('button', { type: 'button', className: 'awr-btn awr-btn-icon', title: t('tools.zoom.in'), 'aria-label': t('tools.zoom.in'), disabled: zoom >= 1.5, onClick: () => setZoom(Math.min(1.5, Math.round((zoom + 0.1) * 10) / 10)) }, h(Icon, { name: 'plus', size: 14 })),
                h('button', { type: 'button', className: 'awr-btn awr-btn-icon', title: t('tools.zoom.fit'), 'aria-label': t('tools.zoom.fit'), onClick: fit }, h(Icon, { name: 'fit', size: 14 }))) : null)),

          filterBar,
          h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 24 } },
            h('div', { ref: area, style: { minWidth: 0, flex: 1 } },
              mode === 'lines' ? h(LinesView, { lanes, nodes: all, t, strip, selected, matches, showDone: showDone || only === 'done', laneFilter, onLane: pickLane, onClear: clearFilters, onPick: pick })
                : mode === 'graph' ? h(GraphView, { nodes: visible, t, selected, matches, zoom, onPick: pick })
                  : h(LanesView, { nodes: visible, lanes, t, strip, selected, matches, zoom, laneFilter, onLane: pickLane, onPick: pick })),
            node ? h(Detail, { key: node.key, node, byKey, t, onPick: (key) => setSelected(key), onClaim: claim, onClose: () => setSelected(undefined) }) : null),

          h(LedgerEvents, { activity: progress.activity, byKey, t, onPick: (key) => setSelected(key) }),

          progress.coverage || progress.health || progress.accounting
            ? h('div', { 'data-testid': 'awr-footzones', style: { marginTop: 40, paddingTop: 20, borderTop: `.5px solid ${C.line2}`, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px 48px' } },
              h(Coverage, { coverage: progress.coverage, t }),
              h(Health, { health: progress.health, t }),
              h(AccountingFacts, { accounting: progress.accounting, t }))
            : null)))
}
