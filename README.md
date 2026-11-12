# dsh-awr

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugin that lets
[AWR (Agent Work Runtime)](https://github.com/originoneai/agent-work-runtime) manage work state
for projects developed inside DSH.

Status: **design stage, no code yet.** Nothing here has been run against a real DSH install.

## What the plugin is for

AWR owns project facts, sessions, claims, checkpoints and evidence. DSH owns the model, the UI
and the native conversation. This plugin is the DSH-side bridge between the two. It talks to AWR
only through the `awr` CLI (argv) and the `awr-mcp` server; it never touches `.awr/state.db*`.

DSH conversations are identified to AWR as `--client generic --external-session dsh:<session id>`.
No DSH-specific client dialect is added to AWR.

## Planned capabilities

| Priority | Capability | DSH surface | AWR action |
| --- | --- | --- | --- |
| P0 | Binary selection and self-check | plugin `apply` | Use `cli` from `.awr/runtime-binding.json`, else `awr` on PATH; stop on schema mismatch or migration prompts |
| P0 | One-click project takeover | button + background subagent | Unattended `init` preview, draft, accept and `intake inspect` loop (see below) |
| P0 | MCP mount | `ctx.mcpManager.register` | Start `awr-mcp --project <cwd>` over stdio |
| P0 | Session binding | `session/created` | `awr client bind`; bind only, never auto-claim |
| P0 | Context injection | `ctx.systemPrompt.context` | Inject next action, open loops and compiled work context |
| P0 | Slash commands | command registry | `/awr status`, `claim`, `checkpoint`, `end` |
| P1 | Checkpoints | `session/event` (`turn/end`, `compaction/*`) | Prompt the model to checkpoint at turn boundaries |
| P1 | Compaction observation | `compaction/summary`, `compaction/end` | Report per AWR's context-continuity protocol |
| P1 | Workflow skill | bundled skill | Teach preview/accept, evidence and completion rules |
| P2 | Evidence candidates | `tools/result` | Suggest, never auto-register |
| P2 | Session mapping | `appendPluginRecord()` | Persist AWR session id; forks resume via `--from-session` |
| P2 | UI panel | `dsh.client` + slots | Current work, claim TTL, blockers |

The DSH surface names above come from reading the DSH documentation, not from a working install.
Each one must be confirmed against a pinned DSH version before it is relied on.

## One-click takeover

Clicking "take over this project" is the only human step. A background subagent then:

1. Preflight: resolve the `awr` binary, read `status`, record Git HEAD, take a lock.
2. Preview: `awr init --json`, with `--write-draft` to a path outside the project.
3. Review the draft: pick the authoritative ledger, choose status/field maps, replace generic
   work with concrete goals, work items, acceptance and next actions, each with provenance.
4. Accept: `init --from-draft ... --accept --expected-preview <fingerprint>`; re-preview if the
   inventory changed (bounded retries).
5. Organize: loop `intake inspect` -> edit sources -> `source reindex` (bounded rounds).
6. Connect the host: MCP, session binding, context injection, `.gitignore` entries.
7. Write a takeover receipt listing what was mapped, created and left for confirmation.

Guardrails:

- Business intent the material cannot establish is recorded as `candidate` /
  `needs_confirmation`, never invented and never asked mid-run.
- Writes are limited to `.awr/` manifest and intake sources by default. Existing ledgers are not
  edited unless the user enabled that option.
- No commit and no push by default.
- Resumable: each step is persisted; a failure before accept leaves the project untouched.
- Hard stops: secret-boundary hits, `source_unreadable`, `Unsupported`, migration prompts, or
  another active session on the project.

A project whose material does not establish its goals ends in `needs_organization`, not `ready`.

## Open questions

- Whether the takeover orchestration lives in this plugin or in the AWR CLI.
- Whether DSH exposes a blockable pre-tool-call hook, and its MCP config file format.
- Whether DSH subagent permission presets can be narrowed to the takeover allowlist.
- Whether AWR has an "undo takeover" path.
