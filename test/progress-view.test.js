// The project's progress for the page (DSH-062): AWR's snapshot turned into nodes a person understands.
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildProgress, headlineOf, layers, linksOf, mainlineOf, OTHER_LANE, outcomesOf, stateOf } from '../lib/progress-view.js'

const node = (key, patch = {}) => ({ key, title: `Work ${key}`, status: 'planned', ready: false, blocker: null, active_claims: [], archived: false, next_action: null, source_ref: { locator: 'file:///p/.awr/intake/work-ledger.yaml', pointer: `/work_items/${key}` }, ...patch })
const edge = (from, to, extra = {}) => ({ from, to, required: true, ...extra })
const snapshot = (nodes, edges = [], extra = {}) => ({
  version: 1,
  project_revision: 42,
  basis: { source_refresh_performed: false },
  work_graph: { nodes, edges, cycle: [], graph_valid: true },
  nav: { project: { name: 'demo', id: 'P1' }, mainline_graph: { nodes: [] } },
  goals: { hits: [] },
  sessions: { sessions: [] },
  ...extra,
})

test('a node is done, blocked, being worked on, ready, waiting or planned, in the order a person would look at it', () => {
  assert.equal(stateOf(node('a', { status: 'completed', blocker: 'old' })), 'done', 'completed beats a stale blocker text')
  assert.equal(stateOf(node('a', { blocker: 'waiting for the owner', status: 'in_progress' })), 'blocked')
  assert.equal(stateOf(node('a', { status: 'in_progress' })), 'active')
  assert.equal(stateOf(node('a', { active_claims: [{}] })), 'active', 'a claim means somebody works on it')
  assert.equal(stateOf(node('a', { ready: true })), 'ready')
  assert.equal(stateOf(node('a'), { explainable_waits: [{ reason: 'x' }] }), 'waiting')
  assert.equal(stateOf(node('a')), 'planned')
  assert.equal(stateOf(node('a', { archived: true })), 'cancelled')
  assert.equal(stateOf(node('a', { status: 'cancelled' })), 'cancelled')
  assert.equal(stateOf(node('a', { blocker: '   ' })), 'planned', 'a blank blocker is none')
})

test('layers: a node sits one step after its deepest dependency, and a cycle does not loop', () => {
  const dependsOn = new Map([['c', ['b', 'a']], ['b', ['a']]])
  const got = layers(['a', 'b', 'c', 'd'], dependsOn)
  assert.deepEqual([...got], [['a', 0], ['b', 1], ['c', 2], ['d', 0]].sort((x, y) => [...got.keys()].indexOf(x[0]) - [...got.keys()].indexOf(y[0])))
  const cyc = layers(['x', 'y'], new Map([['x', ['y']], ['y', ['x']]]))
  assert.ok(Number.isFinite(cyc.get('x')) && Number.isFinite(cyc.get('y')))
})

test('the view has the counts, the dependencies and what each node unlocks', () => {
  const view = buildProgress(snapshot(
    [node('A', { status: 'completed' }), node('B', { status: 'in_progress', next_action: 'Write the tests' }), node('C', { ready: true }), node('D', { blocker: 'The owner has to decide' }), node('E', { status: 'cancelled' })],
    [edge('B', 'A'), edge('C', 'B'), edge('D', 'B', { required: false })],
    { sessions: { sessions: [{ status: 'active' }, { status: 'ended' }] }, nav: { project: { name: 'demo' }, mainline_graph: { nodes: [] } } },
  ), { now: 1000 })
  assert.equal(view.ok, true)
  assert.equal(view.updatedAt, 1000)
  assert.equal(view.project, 'demo')
  assert.deepEqual(view.counts, { total: 4, done: 1, active: 1, ready: 1, blocked: 1, waiting: 0, planned: 0, sessions: 1 }, 'a cancelled item is not counted')
  const byKey = Object.fromEntries(view.nodes.map((n) => [n.key, n]))
  assert.deepEqual([byKey.A.layer, byKey.B.layer, byKey.C.layer, byKey.D.layer], [0, 1, 2, 2])
  assert.deepEqual(byKey.B.dependsOn, ['A'])
  assert.deepEqual(byKey.A.unlocks, ['B'])
  assert.deepEqual(byKey.B.unlocks.sort(), ['C', 'D'])
  assert.equal(byKey.B.next, 'Write the tests')
  assert.equal(byKey.D.blocker, 'The owner has to decide')
  assert.deepEqual(view.edges.find((e) => e.from === 'D'), { from: 'D', to: 'B', required: false })
})

test('what needs a person: blocked work and goals nobody confirmed', () => {
  const view = buildProgress(snapshot(
    [node('A', { blocker: 'Waiting for the API key' }), node('B', { status: 'completed' })],
    [],
    { goals: { hits: [{ external_key: 'g1', title: 'Search the portal', status: 'candidate' }, { external_key: 'g2', title: 'Ship it', status: 'active' }] } },
  ))
  assert.deepEqual(view.attention, [
    { kind: 'blocked', key: 'A', title: 'Work A', detail: 'Waiting for the API key' },
    { kind: 'goal', title: 'Search the portal' },
  ])
})

test('a mainline is the prefix of the key a person wrote; a generated key takes the identifier its title starts with', () => {
  assert.equal(mainlineOf('DSH-058', 'x'), 'DSH')
  assert.equal(mainlineOf('AWR-TF-014AN', 'x'), 'AWR-TF')
  assert.equal(mainlineOf('WORK-5fbaebd1b940cce21825828254ef68e6', 'DSH-058: Claim, checkpoint and end'), 'DSH')
  assert.equal(mainlineOf('WORK-5fbaebd1b940cce21825828254ef68e6', 'DSH-058：中文冒号也算'), 'DSH')
  assert.equal(mainlineOf('md-01da5526bf2dd4bcdcdb8025c57c2c24fcc89747307b1e6e452e330fc92b8694', 'Search endpoint'), OTHER_LANE, 'a generated key and a plain title name no mainline')
  assert.equal(mainlineOf('SOLO', 'x'), OTHER_LANE, 'a key without a prefix')
  assert.equal(mainlineOf('WORK-12', 'x'), 'WORK', 'a short number is a key a person wrote')
})

test('mainlines are listed in the order they appear with their progress; small ones are shown together, last', () => {
  const view = buildProgress(snapshot([
    node('TF-1', { status: 'completed' }), node('TF-2'), node('TF-3', { status: 'completed' }),
    node('ONE-1'),
    node('OBS-1'), node('OBS-2'), node('OBS-3', { status: 'completed' }),
    node('WORK-5fbaebd1b940cce21825828254ef68e6', { title: 'TF-4: late', status: 'cancelled' }),
    node('TWO-1'), node('TWO-2'),
  ]))
  assert.deepEqual(view.lanes, [
    { id: 'TF', total: 3, done: 2 },
    { id: 'OBS', total: 3, done: 1 },
    { id: OTHER_LANE, total: 3, done: 0 },
  ], 'ONE and TWO are too small for a lane of their own; the cancelled item is not counted')
  const byKey = Object.fromEntries(view.nodes.map((n) => [n.key, n]))
  assert.equal(byKey['TF-2'].lane, 'TF')
  assert.equal(byKey['ONE-1'].lane, OTHER_LANE)
  assert.equal(byKey['WORK-5fbaebd1b940cce21825828254ef68e6'].lane, 'TF', 'four items make TF, with the generated key counted by its title')
})

test('the mainline graph adds the acceptance and the waits to a node', () => {
  const view = buildProgress(snapshot([node('A-1'), node('A-2'), node('A-3')], [], {
    nav: {
      project: { name: 'demo' },
      mainline_graph: {
        nodes: [
          { work_key: 'A-1', outcomes: ['It runs', 'It is documented'], blocker: null, explainable_waits: [] },
          { work_key: 'A-2', outcomes: [], blocker: null, explainable_waits: [{ reason: 'depends' }] },
        ],
      },
    },
  }))
  const byKey = Object.fromEntries(view.nodes.map((n) => [n.key, n]))
  assert.deepEqual(byKey['A-1'].outcomes, ['It runs', 'It is documented'])
  assert.equal(byKey['A-2'].state, 'waiting')
  assert.equal(byKey['A-3'].state, 'planned')
})

test('work without criteria of its own shows no "done when": AWR\'s placeholder names a generated key and repeats the title', () => {
  const hashed = 'md-01da5526bf2dd4bcdcdb8025c57c2c24fcc89747307b1e6e452e330fc92b8694'
  const view = buildProgress(snapshot([node(hashed, { title: 'Search endpoint' }), node('DSH-058', { title: 'Claim from the panel' }), node('A-3', { title: 'Upload' })], [], {
    nav: {
      project: { name: 'demo' },
      mainline_graph: {
        nodes: [
          { work_key: hashed, outcomes: [`accepted completion of ${hashed} — Search endpoint`], explainable_waits: [] },
          { work_key: 'DSH-058', outcomes: ['accepted completion of DSH-058 — Claim from the panel'], explainable_waits: [] },
          { work_key: 'A-3', outcomes: ['accepted completion of SOMETHING-ELSE — Upload', 'A PDF can be uploaded'], explainable_waits: [] },
        ],
      },
    },
  }))
  const byKey = Object.fromEntries(view.nodes.map((n) => [n.key, n]))
  assert.equal('outcomes' in byKey[hashed], false, 'a generated hash is never shown')
  assert.equal('outcomes' in byKey['DSH-058'], false, 'the placeholder of a work that has a readable key says nothing either')
  assert.deepEqual(byKey['A-3'].outcomes, ['accepted completion of SOMETHING-ELSE — Upload', 'A PDF can be uploaded'], 'a sentence that names another key is somebody\'s own and stays')
  assert.ok(!JSON.stringify(view.nodes.map((n) => n.outcomes ?? [])).includes('md-01da'), 'no generated key is left in what the drawer lists')
})

test('a criterion somebody wrote is kept as written, with a generated key taken out of it', () => {
  assert.deepEqual(outcomesOf(['It runs', '  It is documented  '], 'A-1'), ['It runs', 'It is documented'])
  assert.deepEqual(outcomesOf(['Output matches md-0123456789abcdef0123 exactly', 'WORK-5fbaebd1b940cce21825828254ef68e6'], 'A-1'), ['Output matches exactly'], 'a criterion that was only a key is gone')
  assert.deepEqual(outcomesOf(['Ships with DSH-058 and AWR-TF-014'], 'A-1'), ['Ships with DSH-058 and AWR-TF-014'], 'a key a person wrote is not a hash')
  assert.deepEqual(outcomesOf(undefined, 'A-1'), [])
  assert.deepEqual(outcomesOf(['', '   '], 'A-1'), [])
})

test('the engineering facts are kept apart in tech, and the node itself carries business words', () => {
  const view = buildProgress(snapshot([node('A')], []))
  const [only] = view.nodes
  assert.equal(only.title, 'Work A')
  assert.deepEqual(only.tech, { key: 'A', source: 'work-ledger.yaml', where: '/work_items/A' })
  assert.equal(view.tech.revision, 42)
  assert.equal(view.tech.graphValid, true)
  assert.equal(view.tech.projectId, 'P1')
})

test('edges to unknown work are dropped, a cycle is reported, and a snapshot without a graph is not a view', () => {
  const view = buildProgress(snapshot([node('A'), node('B')], [edge('A', 'B'), edge('B', 'A'), edge('A', 'ZZZ')]))
  assert.equal(view.edges.length, 2, 'the edge to ZZZ is dropped')
  const cyclic = buildProgress(snapshot([node('A')], [], { work_graph: { nodes: [node('A')], edges: [], cycle: [['A', 'B']], graph_valid: false } }))
  assert.equal(cyclic.hasCycle, true)
  assert.equal(cyclic.tech.graphValid, false)
  assert.deepEqual(buildProgress({}, { now: 5 }), { ok: false, reason: 'no_graph', updatedAt: 5 })
  assert.deepEqual(buildProgress({ work_graph: {} }, { now: 5 }), { ok: false, reason: 'no_graph', updatedAt: 5 })
})

test('a project with no work at all is a valid, empty view', () => {
  const view = buildProgress(snapshot([], []))
  assert.equal(view.ok, true)
  assert.deepEqual(view.counts, { total: 0, done: 0, active: 0, ready: 0, blocked: 0, waiting: 0, planned: 0, sessions: 0 })
  assert.deepEqual(view.attention, [])
})

test('the view answers the four questions and says honestly why work waits', () => {
  const view = buildProgress(snapshot(
    [node('A', { status: 'in_progress', active_claims: [{ agent_id: 'bot-1' }], next_action: 'Write the tests' }), node('B')],
    [edge('B', 'A')],
    {
      goals: { hits: [{ title: 'Someday maybe', status: 'candidate' }, { title: 'Everyone can find a document', status: 'active' }] },
      nav: {
        project: { name: 'demo' },
        mainline_graph: { nodes: [{ work_key: 'B', explainable_waits: [{ summary: 'Waiting on outcome of A', release_condition: 'Complete and accept A' }] }] },
        accounting: { available: false, reason: 'approved_contract_and_verified_observations_required' },
      },
    },
  ), { now: 1000 })
  assert.equal(view.schema, 2)
  assert.deepEqual(view.goal, { title: 'Everyone can find a document', status: 'active' }, 'the confirmed goal is the goal')
  assert.deepEqual(view.next, {
    key: 'A',
    state: 'active',
    text: 'Write the tests',
    headline: 'Write the tests',
    lane: { id: '~other', done: 0, total: 2 },
    claimed: true,
    claimedBy: 'bot-1',
  }, 'the next step is actionable work, with its key, its sentence, its mainline and who holds it')
  const byKey = Object.fromEntries(view.nodes.map((n) => [n.key, n]))
  assert.equal(byKey.A.claimedBy, 'bot-1', 'whose turn has a name')
  assert.deepEqual(byKey.B.wait, { summary: 'Waiting on outcome of A', release: 'Complete and accept A' })
  assert.equal(byKey.B.state, 'waiting')
  assert.equal(view.accounting.available, false, 'accounting is passed through as it is, including when it says no')
})

test('the coverage counts what this awr declares and what this machine answers, by domain', () => {
  const capabilities = { program: { version: '0.7.0' }, capabilities: [
    { id: 'work.claim', available: true },
    { id: 'work.checkpoint', available: true },
    { id: 'team.handoff', available: false },
  ] }
  const view = buildProgress(snapshot([node('A-1')]), { capabilities })
  assert.deepEqual(view.coverage, {
    total: 3,
    available: 2,
    groups: [{ id: 'work', total: 2, available: 2 }, { id: 'team', total: 1, available: 0 }],
    cliVersion: '0.7.0',
  })
  assert.equal(buildProgress(snapshot([node('A-1')])).coverage, undefined, 'not read means not shown')
  assert.equal(buildProgress(snapshot([node('A-1')]), { capabilities: { capabilities: [] } }).coverage, undefined, 'an empty document answers nothing')
})

test('the health is what awr doctor says, and nothing more', () => {
  const good = buildProgress(snapshot([node('A-1')]), { doctor: { database_ok: true, schema_version: 14, integrity: ['ok'], foreign_key_violations: 0, schema_issues: [] } })
  assert.deepEqual(good.health, { ok: true, issues: [], schemaVersion: 14 })
  const bad = buildProgress(snapshot([node('A-1')]), { doctor: { database_ok: false, schema_issues: [{ problem: 'x' }], foreign_key_violations: 3, integrity: ['ok', 'foreign_key_mismatch'] } })
  assert.equal(bad.health.ok, false)
  assert.deepEqual(bad.health.issues, ['database', 'schema', 'references', 'integrity'])
  assert.equal(buildProgress(snapshot([node('A-1')])).health, undefined, 'a doctor nobody ran has no opinion')
})


test('a broken source is shown as what is broken, never as an empty ledger', () => {
  const status = { ok: false, source_issues: [
    { code: 'SourceConflict', message: 'source fingerprint conflict: work_items "INTAKE-001" already has a different source or identity' },
    { code: 'ledger_empty', message: '  ' },
    { code: 'long', message: 'x'.repeat(500) },
    { code: 'd', message: 'd' }, { code: 'e', message: 'e' }, { code: 'f', message: 'f' },
  ] }
  const view = buildProgress(snapshot([node('A-1')]), { status })
  assert.equal(view.sourceIssues.length, 4, 'at most four are shown at once')
  assert.deepEqual(view.sourceIssues[0], { code: 'SourceConflict', message: 'source fingerprint conflict: work_items "INTAKE-001" already has a different source or identity' })
  assert.equal(view.sourceIssues[1].message, 'ledger_empty', 'an issue without a message says its code')
  assert.ok(view.sourceIssues[2].message.length <= 201, 'a long message is cut short')
  assert.equal(buildProgress(snapshot([node('A-1')])).sourceIssues, undefined, 'a source nobody asked about has no complaint')
  assert.equal(buildProgress(snapshot([node('A-1')]), { status: { source_issues: [] } }).sourceIssues, undefined, 'no issue, no banner')
  assert.equal(buildProgress(snapshot([node('A-1')]), { status: { source_issues: [{ code: 'x' }, null] } }).sourceIssues.length, 1, 'only what the source actually says')
})

test('a headline stops where a person stops reading and never finishes the sentence by guess', () => {
  assert.equal(headlineOf('推倒重来：节点4 交付。剩余 4 项待业主验收'), '推倒重来：节点4 交付')
  assert.equal(headlineOf('PR #1 已开：https://github.com/o/r/pull/1 （可自动合并，403 项 0 失败）'), 'PR #1 已开', 'an address is where it points, a bracket is a footnote')
  assert.equal(headlineOf('已在本地完成并通过全部测试'), '已在本地完成并通过全部测试', 'a sentence already short is kept word for word')
  assert.equal(headlineOf('x'.repeat(60)).length, 41, 'a long line is cut short and marked, never rewritten')
  assert.ok(headlineOf('x'.repeat(60)).endsWith('…'))
  assert.equal(headlineOf('https://github.com/o/r/pull/1'), undefined, 'an address alone says nothing')
  assert.equal(headlineOf(''), undefined)
  assert.deepEqual(linksOf('见 https://github.com/o/r/pull/1 与 https://a.example/x 及 https://b.example/y'), ['https://github.com/o/r/pull/1', 'https://a.example/x'], 'at most two addresses')
  assert.equal(linksOf('没有链接'), undefined, 'nothing to open, nothing to show')
})

test('the next step is a sentence, why it is yours, and what it moves — all of it copied from AWR', () => {
  const view = buildProgress(snapshot(
    [
      node('DSH-077', {
        status: 'in_progress',
        next_action: 'PR #1 已开：https://github.com/o/r/pull/1 （可自动合并）。等业主按八项像素验收后合并。',
        active_claims: [{ agent_id: 'bot-1' }],
        last_event_at: 1700,
      }),
      node('DSH-078', { status: 'completed' }),
      node('DSH-079'),
    ],
    [],
    {
      nav: {
        project: { name: 'demo' },
        mainline_graph: { nodes: [{ work_key: 'DSH-077', outcomes: ['页面在真实数据下可读' ] }] },
        guidance: { basis: 'Work DSH-077 (节点4)', when: '台账变化时', recheck: '刷新' },
      },
    },
  ), { now: 1000 })
  assert.equal(view.next.headline, 'PR #1 已开')
  assert.deepEqual(view.next.links, ['https://github.com/o/r/pull/1'])
  assert.equal(view.next.text, 'PR #1 已开：https://github.com/o/r/pull/1 （可自动合并）。等业主按八项像素验收后合并。', 'the full sentence is kept for the person who wants it')
  assert.deepEqual(view.next.lane, { id: 'DSH', done: 1, total: 3 }, 'the metric is a real lane count, not a blended percent')
  assert.equal(view.next.claimed, true)
  assert.equal(view.next.claimedBy, 'bot-1')
  assert.equal(view.next.changedAt, 1700)
  assert.deepEqual(view.next.checklist, ['页面在真实数据下可读'], 'what it has to achieve travels with it')
  assert.deepEqual(view.guidance, { basis: 'Work DSH-077 (节点4)', when: '台账变化时', recheck: '刷新' }, 'why this line and when to look again')
})

test('a next step with nothing beside it stays a next step, without invented facts', () => {
  const view = buildProgress(snapshot([node('DSH-077', { status: 'in_progress', next_action: '写测试' }), node('DSH-078'), node('DSH-079')]))
  assert.deepEqual(view.next, { key: 'DSH-077', state: 'active', text: '写测试', headline: '写测试', lane: { id: 'DSH', done: 0, total: 3 } })
  assert.equal(view.guidance, undefined, 'AWR said nothing about why this line, so the page says nothing either')
})

test('the page names who has their hands on the work, and says nothing about what they are typing', () => {
  const view = buildProgress(snapshot([
    node('DSH-077', { id: 'ID-77', status: 'completed' }),
    node('DSH-078', { id: 'ID-78', status: 'in_progress' }),
    node('DSH-079', { id: 'ID-79' }),
  ], [], {
    sessions: {
      may_have_more: false,
      sessions: [
        { status: 'active', work_item_id: 'ID-78', model: 'some-model', started_at: 1000, start_project_revision: 44, last_checkpoint_id: 'C1' },
        { status: 'active', work_item_id: null, started_at: 2000 },
        { status: 'ended', work_item_id: 'ID-77', started_at: 3000 },
      ],
    },
  }), { now: 5000 })
  assert.deepEqual(view.working.items, [
    // A session that claimed nothing stays visible: a missing row would read as nobody working.
    { startedAt: 2000 },
    { key: 'DSH-078', title: 'Work DSH-078', lane: 'DSH', model: 'some-model', startedAt: 1000, startRevision: 44, checkpoint: true },
  ], 'newest first, ended sessions left out, the claimed work found by its id')
  assert.equal(view.working.mayHaveMore, undefined)
})

test('the ledger’s own events come through in AWR’s words, newest first, and a cut-off read says so', () => {
  const graph = snapshot([node('DSH-077', { id: 'ID-77' }), node('DSH-078', { id: 'ID-78' }), node('DSH-079', { id: 'ID-79' })])
  const view = buildProgress(graph, {
    now: 5000,
    events: {
      events: [
        { type: 'checkpoint.created', summary: 'Checkpoint written', created_at: 100, project_revision: 3, work_item_id: 'ID-77', importance: 'normal' },
        { type: 'work.blocked', summary: 'Work blocked', created_at: 200, project_revision: 4, work_item_id: null, importance: 'high' },
      ],
      next_cursor: { project_revision: 4 },
    },
  })
  assert.deepEqual(view.activity.items, [
    { kind: 'work.blocked', summary: 'Work blocked', at: 200, revision: 4, importance: 'high' },
    { kind: 'checkpoint.created', summary: 'Checkpoint written', at: 100, revision: 3, key: 'DSH-077' },
  ], 'the summaries are AWR’s own words, and only a normal importance is left unwritten')
  assert.equal(view.activity.truncated, true, 'a bounded read admits it is bounded')
})

test('an empty ledger read is reported as empty, and an awr that hands over nothing gives the page nothing to show', () => {
  const graph = snapshot([node('DSH-077'), node('DSH-078'), node('DSH-079')])
  assert.deepEqual(buildProgress(graph, { events: { events: [] } }).activity, { items: [], source: 'history' })
  assert.equal(buildProgress(graph).activity, undefined, 'no read at all, so the page says it read nothing rather than that nothing happened')
  const carried = buildProgress(snapshot([node('DSH-077', { id: 'ID-77' }), node('DSH-078'), node('DSH-079')], [], {
    events: { events: [{ type: 'session.started', summary: 'Session started', created_at: 10, work_item_id: 'ID-77' }], next_cursor: null },
  }))
  assert.deepEqual(carried.activity.items, [{ kind: 'session.started', summary: 'Session started', at: 10, key: 'DSH-077' }], 'a snapshot that does carry events is used as it is')
})

// What awr doctor actually ships: { ok, database_ok, …, findings[] } — the findings are real, actionable, and
// the page must show them (rev 130 real data: five orphan_session errors the page used to swallow).
const orphanFinding = (id) => ({ code: 'orphan_session', message: 'Active session has inconsistent bindings: bound work item is terminal or unusable (completed)', object_id: id, object_kind: 'session', repair: { kind: 'interrupt_session', session_id: id }, severity: 'error' })
test('doctor findings reach the page instead of being swallowed behind a sound database', () => {
  const doctor = {
    ok: false, database_ok: true, schema_version: 14, integrity: ['ok'], foreign_key_violations: 0, schema_issues: [],
    findings: [
      orphanFinding('01M79R9SQBX26RJTY25HZ2X9M8'), orphanFinding('01M79R9SRVZ421DR39DVMWKR8B'),
      { code: 'active_session', message: 'Session is active in the database; process liveness was not inspected, so death cannot be inferred', object_id: '01M7AH4A22QKK5GGJBCEXWYZZH', object_kind: 'session', repair: { kind: 'interrupt_session', session_id: '01M7AH4A22QKK5GGJBCEXWYZZH' }, severity: 'info' },
    ],
  }
  const view = buildProgress(snapshot([node('A-1')]), { doctor })
  assert.equal(view.health.ok, false, 'the doctor says not sound; the page cannot call it sound')
  assert.deepEqual(view.health.issues, [], 'it is the findings that hurt, not the database itself')
  assert.deepEqual(view.health.findings, [
    { code: 'orphan_session', severity: 'error', message: 'Active session has inconsistent bindings: bound work item is terminal or unusable (completed)', count: 2, repair: 'interrupt_session', ids: ['01M79R9SQBX26RJTY25HZ2X9M8', '01M79R9SRVZ421DR39DVMWKR8B'] },
    { code: 'active_session', severity: 'info', message: 'Session is active in the database; process liveness was not inspected, so death cannot be inferred', count: 1, repair: 'interrupt_session', ids: ['01M7AH4A22QKK5GGJBCEXWYZZH'] },
  ], 'AWR own words, same-code findings counted, in the order the doctor gave them')
  const found = view.attention.filter((entry) => entry.kind === 'finding')
  assert.equal(found.length, 1, 'errors ask for the person; an info note does not')
  assert.equal(found[0].code, 'orphan_session')
  assert.equal(found[0].count, 2)
  assert.equal(found[0].detail, 'Active session has inconsistent bindings: bound work item is terminal or unusable (completed)', 'AWR wording kept, not rewritten')
  assert.equal(found[0].ids[0], '01M79R9SQBX26RJTY25HZ2X9M8', 'the ids ride along for the detail fold, never the headline')
  const quiet = buildProgress(snapshot([node('A-1')]), { doctor: { ok: true, database_ok: true, integrity: ['ok'], foreign_key_violations: 0, schema_issues: [], findings: [] } })
  assert.equal(quiet.health.findings, undefined, 'a doctor that found nothing has nothing to say')
})
