// The project's progress for the page in DeepSeek Harness (DSH-062), made from `awr overview snapshot`.
//
// AWR's own Project Progress Overview shows a project as a node graph, a mainline graph and swimlanes. This file turns the
// snapshot it reads (`work_graph`, `nav.mainline_graph`, `goals`, `sessions`) into what the page draws: nodes with a state a
// person understands (done, being worked on, ready to start, blocked, waiting, planned), the dependencies between them, the
// mainlines (the groups AWR's overview makes from the prefix of the work keys: DSH-012 belongs to DSH), the counts, and
// what needs the person's attention. Nothing here is invented: a node is as AWR reports it, and what AWR does not report
// is left out.
//
// The page shows business words first. Identifiers, revisions and source locations are kept apart in `tech`, for the
// "technical details" a person opens on purpose.

/** The shape of the view. The page takes a file of another shape for no file and asks the host to write it again. */
export const PROGRESS_SCHEMA = 2

/** The state of a work item as a person would name it. */
export const STATES = ['active', 'blocked', 'ready', 'waiting', 'planned', 'done', 'cancelled']

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)
const list = (value) => (Array.isArray(value) ? value : [])

/** The state of one node: AWR's own facts, in the order a person would look at them. */
export function stateOf(node, mainline) {
  if (node.archived || node.status === 'cancelled' || node.status === 'closed_without_completion') return 'cancelled'
  if (node.status === 'completed') return 'done'
  if (text(node.blocker ?? mainline?.blocker)) return 'blocked'
  if (node.status === 'in_progress' || list(node.active_claims).length > 0) return 'active'
  if (node.ready === true) return 'ready'
  if (list(mainline?.explainable_waits).length > 0) return 'waiting'
  return 'planned'
}

/** A key AWR generated (`WORK-5fba…`, `md-01da…`) says nothing about a mainline; a key a person wrote (`DSH-058`) does. */
const GENERATED_KEY = /^[A-Za-z]+-[0-9a-f]{12,}$/
const LEADING_ID = /^([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+)\s*[:：]/
/** The mainline lanes smaller than this are shown together as "other". */
const SMALL_LANE = 3
/** How much of a next step reads as a sentence. The rest of it stays available to expand, never silently dropped. */
const HEADLINE_MAX = 40
export const OTHER_LANE = '~other'

/**
 * The mainline of a work item: the prefix of its key (`AWR-TF-014` → `AWR-TF`). A generated key has no prefix of its own,
 * so the identifier its title starts with is used when there is one (`DSH-058: Claim…` → `DSH`).
 */
export function mainlineOf(key, title) {
  const named = GENERATED_KEY.test(String(key)) ? LEADING_ID.exec(String(title ?? ''))?.[1] : String(key)
  if (!named || !named.includes('-')) return OTHER_LANE
  return named.slice(0, named.lastIndexOf('-'))
}

/** A key AWR made up for work that came from a Markdown item, wherever it turns up inside a sentence. */
const GENERATED_IN_TEXT = /\b[A-Za-z]+-[0-9a-f]{12,}\b/g
/** What AWR writes for work with no acceptance criteria of its own: the work's key and its title, again. */
const PLACEHOLDER_OUTCOME = /^accepted completion of (\S+) [—–-] /

/**
 * What a piece of work is done when, for a person. AWR words work without criteria as "accepted completion of <key> —
 * <title>"; for work that came from a Markdown item the key is a generated hash. That is no criterion (the card already
 * says the title), so it is left out, and the drawer shows no "done when" at all. A criterion somebody wrote is kept as it
 * is, only a generated key inside it is taken out.
 */
export function outcomesOf(outcomes, key) {
  const shown = []
  for (const outcome of list(outcomes)) {
    const given = String(outcome)
    if (PLACEHOLDER_OUTCOME.exec(given)?.[1] === key) continue
    const kept = text(given.replace(GENERATED_IN_TEXT, '').replace(/\s{2,}/g, ' '))
    if (kept) shown.push(kept)
  }
  return shown
}

/** The file a node comes from, without the directory: `work-ledger.yaml`. */
const sourceName = (ref) => {
  const locator = text(ref?.locator)
  return locator ? decodeURIComponent(locator.split('/').pop() ?? locator) : undefined
}

/** `generic:dsh:session-c719…` is a machine name; what a person recognizes is the model and when it started. */
const modelOf = (session) => text(session?.model) ?? text(session?.provider)

/**
 * Who AWR says is working on this project right now (DSH-079 P1): the active sessions, each pointed at the work it
 * claimed. AWR does not know what a person is doing at this second — it knows a session is open and what it claimed —
 * so the strip says that and nothing more. A session whose work item is not in this ledger says so; it is not hidden.
 * `resolve` turns AWR's internal id into the work a page already shows, or nothing.
 */
export function nowView(snapshot, resolve) {
  const active = list(snapshot?.sessions?.sessions).filter((session) => session?.status === 'active')
  const items = active.map((session) => {
    const work = resolve(session.work_item_id) ?? {}
    return {
      ...(work.key ? { key: work.key } : {}),
      ...(work.title ? { title: work.title } : {}),
      ...(work.lane ? { lane: work.lane } : {}),
      ...(modelOf(session) ? { model: modelOf(session) } : {}),
      ...(Number.isFinite(session.started_at) ? { startedAt: session.started_at } : {}),
      ...(Number.isFinite(session.start_project_revision) ? { startRevision: session.start_project_revision } : {}),
      ...(session.last_checkpoint_id ? { checkpoint: true } : {}),
    }
  }).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
  if (!items.length) return null
  return { items, ...(snapshot?.sessions?.may_have_more === true ? { mayHaveMore: true } : {}) }
}

/**
 * The ledger's own history (DSH-079 P1). `awr overview snapshot` carries an empty window on this machine while
 * `awr event history` carries the real one, so the host may hand the events over separately; whichever came, the page
 * shows what is there and says when the read was cut short. Nothing here is inferred: an event AWR did not write
 * does not appear.
 */
export function activityView(events, resolve) {
  const source = Array.isArray(events?.events) ? events : undefined
  if (!source) return null
  const items = source.events.map((event) => {
    const work = resolve(event?.work_item_id) ?? {}
    return {
      ...(text(event?.type) ? { kind: text(event.type) } : {}),
      ...(text(event?.summary) ? { summary: text(event.summary) } : {}),
      ...(Number.isFinite(event?.created_at) ? { at: event.created_at } : {}),
      ...(Number.isFinite(event?.project_revision) ? { revision: event.project_revision } : {}),
      ...(event?.importance && event.importance !== 'normal' ? { importance: text(event.importance) } : {}),
      ...(work.key ? { key: work.key } : {}),
    }
  }).filter((event) => event.summary || event.kind)
  // Newest first: a person reads a ledger from what just happened.
  items.sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
  return { items, ...(source.next_cursor ? { truncated: true } : {}), source: 'history' }
}

/**
 * The layer of each node: 0 for a node that depends on nothing, one more than its deepest dependency otherwise. A cycle
 * (AWR reports it, and the page says so) does not loop: a node already being measured counts as layer 0.
 */
export function layers(keys, dependsOn) {
  const memo = new Map()
  const visiting = new Set()
  const depth = (key) => {
    if (memo.has(key)) return memo.get(key)
    if (visiting.has(key)) return 0
    visiting.add(key)
    let deepest = -1
    for (const dependency of dependsOn.get(key) ?? []) deepest = Math.max(deepest, depth(dependency))
    visiting.delete(key)
    memo.set(key, deepest + 1)
    return deepest + 1
  }
  for (const key of keys) depth(key)
  return memo
}

/**
 * What this `awr` can do, from its own negotiation (`awr capabilities`): every capability the build declares, whether
 * this machine answers it, and the domain each one belongs to. Nothing is guessed: a capability not in the document is
 * not counted, and a document that cannot be read gives no coverage at all.
 */
export function coverageView(document) {
  const caps = list(document?.capabilities)
  if (!caps.length) return null
  const groups = []
  for (const cap of caps) {
    const id = text(cap?.id)?.split('.')[0]
    if (!id) continue
    let group = groups.find((item) => item.id === id)
    if (!group) groups.push((group = { id, total: 0, available: 0 }))
    group.total += 1
    if (cap?.available === true) group.available += 1
  }
  return {
    total: caps.length,
    available: caps.filter((cap) => cap?.available === true).length,
    groups,
    ...(text(document?.program?.version) ? { cliVersion: text(document.program.version) } : {}),
  }
}

/**
 * The one line a person acts on, taken out of what AWR says is next — never rewritten, only stopped where a person
 * would stop reading. A URL is where the sentence points and not the sentence, so it comes out of the line and is
 * shown beside it; a bracket is a footnote, so the line stops before it. What is left over is cut short and marked
 * with an ellipsis rather than finished by guess, and a sentence that says nothing gives no line at all.
 */
export function headlineOf(value) {
  const given = text(value)
  if (!given) return undefined
  const first = given.replace(/https?:\/\/\S+/g, ' ').split(/[。；;\n]/)[0].split(/[（(①②③]/)[0]
  const kept = first.replace(/[：:，,、；;\s]+$/u, '').trim()
  if (!kept) return undefined
  return kept.length > HEADLINE_MAX ? `${kept.slice(0, HEADLINE_MAX).trimEnd()}…` : kept
}

/** Where the next step points, as links a person can open: the addresses AWR was told, up to two of them. */
export function linksOf(value) {
  const found = [...String(value ?? '').matchAll(/https?:\/\/[^\s<>）)（]+/g)].map((match) => match[0])
  return found.length ? found.slice(0, 2) : undefined
}

/**
 * What AWR says is wrong with the project's sources (`awr status --cached` → `source_issues`): an unreadable ledger is a
 * loud fact, not an empty page. Only the issues AWR itself reported are repeated, up to four, each cut to one line.
 */
export function sourceIssuesView(status) {
  const issues = list(status?.source_issues)
    .map((issue) => (typeof issue?.code === 'string' && issue.code.trim()
      ? { code: issue.code.trim(), message: (text(issue.message) ?? issue.code.trim()).slice(0, 200) }
      : null))
    .filter(Boolean)
    .slice(0, 4)
  return issues.length ? issues : undefined
}

/**
 * Whether the project is well, from `awr doctor` — read-only, and only what it actually says.
 * The real doctor ships { ok, database_ok, …, findings[] }; findings are its own diagnoses
 * (rev 130: five orphan_session errors behind a perfectly healthy database). Same code+message
 * counts as one line with a count; AWR keeps the wording, ids ride along for the detail fold.
 */
export function healthView(doctor) {
  if (!doctor || typeof doctor !== 'object') return null
  const issues = []
  if (doctor.database_ok !== true) issues.push('database')
  if (list(doctor.schema_issues).length) issues.push('schema')
  if (Number(doctor.foreign_key_violations) > 0) issues.push('references')
  const integrity = list(doctor.integrity).map(String)
  if (integrity.length && !integrity.every((word) => word === 'ok')) issues.push('integrity')
  const groups = new Map()
  for (const finding of list(doctor.findings)) {
    const code = text(finding?.code)
    if (!code) continue
    const message = (text(finding.message) ?? code).slice(0, 300)
    const severity = text(finding.severity) ?? 'error'
    const repair = text(finding?.repair?.kind)
    const by = `${code}\u0000${severity}\u0000${message}\u0000${repair ?? ''}`
    const seen = groups.get(by)
    if (seen) {
      seen.count += 1
      if (text(finding.object_id) && seen.ids.length < 8) seen.ids.push(finding.object_id.trim())
      continue
    }
    groups.set(by, { code, severity, message, count: 1, ...(repair ? { repair } : {}), ids: text(finding.object_id) ? [finding.object_id.trim()] : [] })
  }
  const findings = [...groups.values()].slice(0, 6)
  return {
    // The doctor's own ok wins when it speaks; our checks catch a doctor that says nothing.
    ok: issues.length === 0 && doctor.ok !== false && !findings.some((finding) => finding.severity === 'error'),
    issues,
    ...(findings.length ? { findings } : {}),
    ...(Number.isFinite(doctor.schema_version) ? { schemaVersion: doctor.schema_version } : {}),
  }
}

/**
 * @param {object} snapshot the answer of `awr overview snapshot --json`
 * @param {{ now?: number, capabilities?: object, doctor?: object, status?: object, events?: object }} [options]
 */
export function buildProgress(snapshot, { now = Date.now(), capabilities, doctor, status, events } = {}) {
  const graph = snapshot?.work_graph
  if (!graph || !Array.isArray(graph.nodes)) return { ok: false, reason: 'no_graph', updatedAt: now }
  // What this awr can do and how its database stands, when the host read them; a question it cannot answer is left out
  // rather than guessed at.
  const coverage = coverageView(capabilities)
  const health = healthView(doctor)
  // What AWR says is broken about the sources; empty work counts with a complaint are never shown as a quiet empty ledger.
  const sourceIssues = sourceIssuesView(status)
  const mainline = new Map(list(snapshot?.nav?.mainline_graph?.nodes).map((node) => [node.work_key, node]))
  const edges = list(graph.edges).filter((edge) => edge?.from && edge?.to)
  const dependsOn = new Map()
  const unlocks = new Map()
  for (const { from, to } of edges) {
    dependsOn.set(from, [...(dependsOn.get(from) ?? []), to])
    unlocks.set(to, [...(unlocks.get(to) ?? []), from])
  }
  // Mainlines with only an item or two would each take a lane of their own; they are shown together.
  const sizes = new Map()
  for (const node of graph.nodes) {
    const lane = mainlineOf(node.key, node.title)
    sizes.set(lane, (sizes.get(lane) ?? 0) + 1)
  }
  const laneOf = (node) => {
    const lane = mainlineOf(node.key, node.title)
    return lane !== OTHER_LANE && sizes.get(lane) >= SMALL_LANE ? lane : OTHER_LANE
  }
  const nodes = graph.nodes.map((node) => {
    const line = mainline.get(node.key)
    const state = stateOf(node, line)
    const outcomes = outcomesOf(line?.outcomes, node.key)
    return {
      key: node.key,
      title: text(node.title) ?? node.key,
      state,
      lane: laneOf(node),
      ...(text(node.next_action ?? line?.next_action) ? { next: text(node.next_action ?? line?.next_action) } : {}),
      ...(text(node.blocker ?? line?.blocker) ? { blocker: text(node.blocker ?? line?.blocker) } : {}),
      ...(outcomes.length ? { outcomes } : {}),
      ...(list(node.active_claims).length ? { claimed: true, ...(text(node.active_claims[0]?.agent_id) ? { claimedBy: text(node.active_claims[0].agent_id) } : {}) } : {}),
      ...(text(list(line?.explainable_waits)[0]?.summary) ? { wait: { summary: text(list(line?.explainable_waits)[0].summary), ...(text(list(line?.explainable_waits)[0].release_condition) ? { release: text(list(line?.explainable_waits)[0].release_condition) } : {}) } } : {}),
      ...(Number.isFinite(node.last_event_at) ? { changedAt: node.last_event_at } : {}),
      tech: { key: node.key, ...(sourceName(node.source_ref) ? { source: sourceName(node.source_ref) } : {}), ...(node.source_ref?.pointer ? { where: node.source_ref.pointer } : {}) },
    }
  })
  const known = new Set(nodes.map((node) => node.key))
  const kept = edges.filter(({ from, to }) => known.has(from) && known.has(to))
  const layerOf = layers(nodes.map((node) => node.key), dependsOn)
  for (const node of nodes) {
    node.layer = layerOf.get(node.key) ?? 0
    node.dependsOn = [...new Set(dependsOn.get(node.key) ?? [])].filter((key) => known.has(key))
    node.unlocks = [...new Set(unlocks.get(node.key) ?? [])].filter((key) => known.has(key))
  }
  const live = nodes.filter((node) => node.state !== 'cancelled')
  const count = (state) => live.filter((node) => node.state === state).length
  // The mainlines in the order their first item appears, "other" last, each with how much of it is done.
  const lanes = []
  for (const node of live) {
    let lane = lanes.find((item) => item.id === node.lane)
    if (!lane) lanes.push((lane = { id: node.lane, total: 0, done: 0 }))
    lane.total += 1
    if (node.state === 'done') lane.done += 1
  }
  lanes.sort((a, b) => (a.id === OTHER_LANE) - (b.id === OTHER_LANE))
  const goals = list(snapshot?.goals?.hits).map((goal) => ({ title: text(goal.title) ?? goal.external_key, status: goal.status ?? 'unknown' }))
  // AWR hands out its own ids everywhere; the page works with the keys it already draws, so both the sessions and the
  // events are translated back to them here. An id with no work behind it stays without one rather than being dropped.
  const keyById = new Map(graph.nodes.map((node) => [node.id, node.key]))
  const viewByKey = new Map(nodes.map((node) => [node.key, node]))
  const resolve = (id) => {
    const key = keyById.get(id)
    const node = key ? viewByKey.get(key) : undefined
    return node ? { key: node.key, title: node.title, lane: node.lane } : undefined
  }
  const working = nowView(snapshot, resolve)
  // The snapshot's own event window is empty on a real project, so the events read separately win; when a snapshot does
  // carry them, they are used as they are.
  const activity = activityView(events ?? (list(snapshot?.events?.events).length ? snapshot.events : undefined), resolve)
  const activeSessions = list(snapshot?.sessions?.sessions).filter((session) => session?.status === 'active').length
  // The four questions a person asks when they open the page: what is the goal, how far, whose turn, what next.
  const goal = goals.find((item) => item.status === 'active') ?? goals[0] ?? null
  // The next step in the order a person can act on it: what is stuck on them first, then what is moving.
  const nextNode = ['blocked', 'active', 'ready', 'waiting'].flatMap((state) => live.filter((node) => node.state === state)).find((node) => node.next || node.blocker || node.wait)
  const nextText = nextNode?.next ?? nextNode?.blocker ?? nextNode?.wait?.summary
  const nextHeadline = headlineOf(nextText)
  const nextLinks = linksOf(nextText)
  const nextLane = nextNode ? lanes.find((item) => item.id === nextNode.lane) : undefined
  // The layer a person reads first (the sentence), why they are the one to act, and what it moves.
  // Everything is a copy of what AWR already says; a missing fact is left out rather than filled in.
  const nextStep = nextText
    ? {
      key: nextNode.key,
      state: nextNode.state,
      text: nextText,
      ...(nextHeadline ? { headline: nextHeadline } : {}),
      ...(nextLinks ? { links: nextLinks } : {}),
      ...(nextLane ? { lane: { id: nextLane.id, done: nextLane.done, total: nextLane.total } } : {}),
      ...(nextNode.claimed === true ? { claimed: true } : {}),
      ...(text(nextNode.claimedBy) ? { claimedBy: nextNode.claimedBy } : {}),
      ...(text(nextNode.blocker) ? { blocker: nextNode.blocker } : {}),
      ...(nextNode.wait ? { wait: nextNode.wait } : {}),
      ...(Number.isFinite(nextNode.changedAt) ? { changedAt: nextNode.changedAt } : {}),
      ...(list(nextNode.outcomes).length ? { checklist: nextNode.outcomes } : {}),
    }
    : null
  // Why this is the line being reported, and when to look again. AWR answers both; the page hands them over.
  const guide = snapshot?.nav?.guidance ?? null
  const guidance = text(guide?.basis)
    ? { basis: text(guide.basis), ...(text(guide.when) ? { when: text(guide.when) } : {}), ...(text(guide.recheck) ? { recheck: text(guide.recheck) } : {}) }
    : null
  return {
    ok: true,
    schema: PROGRESS_SCHEMA,
    updatedAt: now,
    project: text(snapshot?.nav?.project?.name) ?? text(snapshot?.nav?.project?.external_key) ?? '',
    goals,
    ...(goal ? { goal } : {}),
    ...(nextStep ? { next: nextStep } : {}),
    ...(guidance ? { guidance } : {}),
    // AWR is explicit that its accounting is not a completion rate; the page shows it as it is, including when empty.
    accounting: snapshot?.nav?.accounting ?? null,
    counts: {
      total: live.length,
      done: count('done'),
      active: count('active'),
      ready: count('ready'),
      blocked: count('blocked'),
      waiting: count('waiting'),
      planned: count('planned'),
      sessions: activeSessions,
    },
    lanes,
    nodes,
    // Who has their hands on the work now, and what the ledger recorded last — both only what AWR itself says.
    ...(working ? { working } : {}),
    ...(activity ? { activity } : {}),
    ...(coverage ? { coverage } : {}),
    ...(health ? { health } : {}),
    ...(sourceIssues ? { sourceIssues } : {}),
    edges: kept.map(({ from, to, required }) => ({ from, to, required: required !== false })),
    hasCycle: list(graph.cycle).length > 0,
    // What a person has to look at: work AWR says is stuck, goals nobody has confirmed, and what the doctor found.
    attention: [
      ...live.filter((node) => node.state === 'blocked').map((node) => ({ kind: 'blocked', key: node.key, title: node.title, detail: node.blocker })),
      ...goals.filter((goal) => goal.status === 'candidate' || goal.status === 'draft').map((goal) => ({ kind: 'goal', title: goal.title })),
      ...(health?.findings ?? []).filter((finding) => finding.severity === 'error').map((finding) => ({ kind: 'finding', code: finding.code, count: finding.count, title: `${finding.code} × ${finding.count}`, detail: finding.message, ids: finding.ids })),
    ],
    tech: {
      revision: snapshot?.project_revision ?? null,
      ...(snapshot?.version != null ? { snapshotVersion: snapshot.version } : {}),
      sourceRefreshed: snapshot?.basis?.source_refresh_performed === true,
      graphValid: graph.graph_valid !== false,
      ...(snapshot?.nav?.project?.id ? { projectId: snapshot.nav.project.id } : {}),
    },
  }
}
