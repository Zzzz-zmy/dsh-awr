# The Progress tab (DSH-062)

AWR has a Project Progress Overview (`awr overview`): the whole project as a node graph, a mainline graph and
swimlanes. This is the same picture inside DeepSeek Harness, as a tab beside Chat and Trajectory
(`client/50-page.js`, the `conversation.view` slot). The card in the header (`docs/panel.md`) says how the project
stands; this tab is where a person looks at the project.

## What it shows

In the order the page lays it out (verified against the rendered tree, not from memory):

1. **The goal band.** Four questions across the top — the goal, how far along, whose turn, when it moved.
2. **The next step, one card, three layers.** The sentence, why it is on you, what it moves — plus the basis line
   and the fold with acceptance criteria and AWR's own accounting words (see below).
3. **Whose hands are on it.** One line per open session: the work item's title, the model, how long it has been
   open; an unclaimed session says so plainly. The starting revision stays in the tooltip (below).
4. **The gauge.** Counts per state ("42 / 46 done") and one bar whose parts are states, the unfinished part hatched
   rather than hidden; the legend counts them and filters the page by a click, with a named filter strip showing what
   is filtered and how to clear it. Numbers carry their counting rule in tooltips; no blended percentage anywhere.
5. **Needs you.** Work with a recorded blocker (with the reason), goals nobody confirmed, and the doctor's error-level
   findings, in AWR's own words (below). When it is empty the page says so — that is good news, not a missing block.
6. **The work, three ways**, one control: *Mainlines* (what is left in each mainline, finished work folded),
   *Dependencies* (what waits for what, in layers; pointing at a card lights its whole chain and dims the rest) and
   *Lanes* (the mainlines side by side, with the dependencies between them). Search, "show finished", zoom and fit.
7. **What the ledger wrote down.** Recent AWR events, English verbatim — a record, not copy — newest first, each
   pointing at the work item it mentions. Empty-read and could-not-read are two different sentences (below).
8. **Is the project sound.** The database's facts plus what `awr doctor` found — grouped by code with counts, AWR's
   own words in the tooltip, and the repair command AWR itself suggests. The page only reads; it never repairs (below).
9. **The accounting.** AWR's own words on what completion means here, shown without a blended percent (honesty law).

One more view, not a section: **the details of one piece of work**, in a drawer — its state, what blocks it, the next
step, what it is done when, what it depends on and what it unlocks (each a link to that work). Identifiers and the
source file are folded under **Technical details**.

The states are AWR's own facts in the order a person looks at them: cancelled or archived, done, blocked (a blocker
is recorded), in progress (in progress or claimed), ready, waiting (AWR names a wait), else not started. A mainline is the
prefix of the work key (`AWR-TF-014` is in `AWR-TF`); a key AWR generated (a hash) has none, so the identifier its title
starts with is used; mainlines with fewer than three items are shown together as "other".

Nothing is invented: a card is as AWR reports it, and what AWR does not report is left out. AWR words work without
acceptance criteria as "accepted completion of <key> — <title>", where the key of work that came from a Markdown item is
a hash; that is no criterion, so the drawer shows no "done when" for it. A criterion somebody wrote is shown as written.

## Where the data comes from

`awr overview snapshot [--refresh] --json` (`work_graph`, `nav.mainline_graph`, `goals`, `sessions`), turned into the
view by `lib/progress-view.js` (`buildProgress`: nodes with a state, edges, lanes, counts, what needs the person, and the
identifiers apart in `tech`) and written by `lib/progress.js` to
`<home>/.local/state/dsh-awr/panel/<conversation>.progress.json`, `schema: 2`. The tab reads the file through DeepSeek
Harness's workspace-file service, so reading puts nothing in the conversation (`docs/conversation-rows.md`).

### The next step, in the three layers a person reads (DSH-079)

`next` answers three questions in one card, and every word of it is what AWR already says:

| Layer | Field | Where it comes from |
| --- | --- | --- |
| What to do | `text`, `headline`, `links` | `next_action`, else `blocker`, else the first `explainable_waits` summary. `headline` is that line stopped where a person stops reading — a URL comes out of it and is shown beside it as `links`, a bracket starts a footnote, and what is left over is cut at 40 characters with an ellipsis rather than finished by guess. |
| Why it is on you | `blocker`, `wait`, `claimed`, `claimedBy` | the same three facts, per piece of work. Nothing claimed says so out loud; it is never written as "nobody is doing it". |
| What it moves | `lane {id,done,total}`, `checklist`, `changedAt` | the lane's own count from the ledger, the acceptance criteria AWR holds for that work, and its last event. |

Beside it, `guidance {basis, when, recheck}` is AWR's own answer to "why this line, while when, look again when".
The card shows **no completion percentage**: AWR's accounting says `never invent a blended completion percent`, so where
its `detail` exists the card quotes it instead of computing a number. `checklist` has no tick — AWR keeps no check mark,
and the card says so rather than drawing empty boxes as if they were unchecked by a person.

All of it is optional: a file written by an older host has none of these fields and the card falls back to the whole
line, so `schema` stays 2.

### Every number says how it was counted (DSH-079 P0-B)

A benchmark page is not pretty because of its colours, it is readable because every number admits where it came from.
Three rules, all of them test-locked:

- **A metric carries its own 口径.** The goal band's four cells, the state count chips, each bar segment, each legend
  chip, a lane count, the acceptance checklist and the "updated" stamp each hold a `title` that says what is being
  counted. The state bar prints `42/ 46 done` plus a line saying *counts, not a completion rate* and **prints no `%`
  anywhere on the page** — the ledger's `accounting.detail` forbids a blended percent, and a ratio drawn from four
  buckets would be exactly that. The bar is measured against the whole ledger, so its remaining width is a hatched
  "not in any of these counts" band instead of an implied 100%.
- **Empty says which of the three empties it is.** `EmptyState` takes `kind`: `none` (the ledger has no work),
  `broken` (a source is unreadable/conflicting, so the counts may be wrong) and `filtered` (there is work, the filter
  hid it — and the panel offers *Clear filters*). A section with nothing in it is not deleted either: an empty
  "Needs you" is good news and is written as such.
- **Filtering is multiplied and never invisible.** The lane chips above each mainline and the state legend are the same
  filter mechanism as the top bar, so clicking a lane narrows the states and vice versa. Every condition still active
  is named in a row above the views with the count it produced (`2 of 7 shown`), each removable on its own, plus
  *Clear all*. Chips not selected dim rather than disappear, so it stays obvious what the alternatives were.

### Whose hands are on it, and what the ledger wrote down (DSH-079 P1)

Two sections answer questions a gauge cannot: *is anyone in there* and *what actually happened*.

- **Right now** lists the sessions AWR has open on the project and the work each one claimed. A row is the work's own
  title, the model running it and how long the session has been open; the ledger revision it started at sits in the
  tooltip with the same 口径 discipline as everywhere else, and no internal id is printed anywhere. A session that
  claimed nothing is named as one rather than dropped — a missing row reads as nobody working, which is a lie of
  omission. AWR knows a session is open, not what a person is doing this second, and the copy says exactly that.
- **Ledger events** is AWR's own history, newest first, in AWR's own words: summaries are a record, not copy, so they
  are not translated. Each row links to the work it is about by that work's title. The host reads them with
  `awr event history` because `awr overview snapshot` carries an empty window; the read is bounded, and when it is, the
  section says so instead of implying it is everything. When the read comes back with nothing it says the read was
  empty, and when the machine's awr will not hand the events over it says that — neither is presented as an idle project.

### What the doctor found, even behind a sound database

`awr doctor` answers more than "is the database healthy": it ships `findings[]`, and rev 130 of this very project had
five `orphan_session` errors — sessions still bound to work that is already completed — while `database_ok` was true.
A page that showed only "database is sound" would be a lie by omission, so:

- The health section names each finding by the code AWR gave it, counts identical ones (`orphan_session × 5`) instead
  of repeating them, and keeps AWR's own sentence in the tooltip, untranslated — it is a diagnosis on record, not copy.
- An error finding also appears under **Needs you**, with the same words, because AWR is asking the person to look.
  Info findings inform the health section only.
- Where the finding carries a repair, the page shows what AWR itself suggested as the runnable command
  (`awr doctor repair interrupt-session`, from `repair.kind`). The page never runs it: repair changes state, this page
  only reads. AWR's own wording for these commands — apply exactly one named runtime repair, preserving sources and
  artifact files — is what the hint says, no more.
- Session ids from findings stay out of the default view like every other id; the batch repair (`finished-work`) does
  not need them.

- The host asks `awr capabilities` whether the awr has `overview snapshot` and never runs the command to find out: an
  awr that does not know it answers `Unsupported`, which poisons the plugin's use of that awr. An old awr gets a sentence
  saying so.
- The tab reads the file every 5 s while it is visible; when it is missing, older than a minute, of another schema or
  says `not_managed` it asks the host (`/awr progress`, drawn as no row), and then once a minute. **Refresh** asks again;
  **Sync project files** has AWR read the project's source files first (`--refresh`).
- After the agent ran an awr command that can change the work, and when a takeover finishes, the host writes the file
  again (only for a conversation whose tab was opened).
- A project AWR does not manage shows the offer to take it over, the same as the card.

## One story with the card

AWR's dependency graph calls work ready when nothing it depends on is open, and `awr status` counts the same work as
blocked when the project is incomplete: AWR starts nothing until its goal, acceptance criteria and next steps are
written (`organization.business_execution_ready` is false; right after a takeover of a plain TODO list it always is).
The card says so (`docs/panel.md`), so the tab holds ready work back while that is the case: it is "not started", and
"The project is not complete yet · 8 details are still to fill in" is the first item under Needs you. In a complete
project the tab shows the graph as AWR does.

## Keyboard

The three views are tabs: one stop of the Tab key, and the arrow keys, Home and End move between them. Escape closes
the drawer. Focus rings are the host's.

## Checked

- Unit and page tests (`npm test`; counts move, run them for the current number): the six states and their order, the
  layers and a cycle, the mainlines, the criteria, what needs the person; the gauge and its filters, needs, the drawer,
  the keyboard, the three views, the host asks, unmanaged projects and old awrs, light and dark, English and Chinese —
  plus the DSH-079 additions: the three layers of the next step, calibers on every number, the three kinds of empty,
  cross-filters, the sessions and ledger events, the doctor's findings reaching both the health section and Needs you.
- `npm run verify:page` (`test-support/verify-page.mjs`): every rule that a machine can judge — no percents, no
  identifiers in view, a silent health section while the doctor refuses is a failure, error findings mirrored into
  Needs you, AWR's repair command present, the read-only claim present, ledger events verbatim — judged against real
  `awr` data, both locales, exit 1 on the first broken rule. Verified against awr 0.7.0 (the machine's) and 0.8.0.
- In the desktop app, real data, at each milestone of the redesign: this project and others, both locales, the drawer
  on a blocked card with its real criteria, the chain of a card, the keyboard; fixtures of an empty project, a dozen
  items, and a 597-item project in a browser harness with the host's own theme, light and dark.

## Not checked

- A project of several thousand items (the 597-item one lays out in a fraction of a second; the graph is drawn in SVG,
  so very large ones will want a canvas).
- Editing: the tab only reads. Work is changed through the agent or `awr`, not here.
- A global page for all projects (a sidebar entry): the tab is per conversation, because the host binds a project to a
  conversation.
