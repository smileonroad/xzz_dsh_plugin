# sql-check-tool example

English | [中文](README.zh.md)

A model-facing tool plugin: `sql_check` validates SQL with the **real SQLite
parser** via Node's built-in `node:sqlite` — zero third-party dependencies.
It demonstrates the [`ctx.tools`](../../packages/core/tools/README.md)
extension point with a contract that is deliberately richer than a slash
command.

## Running

This directory is the **source of truth** for the plugin. To run it, first
copy it into the deepseek-harness source's `examples/` (the copy over there may
be stale), then operate from the deepseek-harness root:

```sh
# 1. Copy into the deepseek-harness source (this repo is the source of truth)
cp -r examples/sql-check-tool ../deepseek-harness/examples/sql-check-tool

# 2a. Run the tests
cd ../deepseek-harness
pnpm exec vitest run examples/sql-check-tool/tests/sql-check-tool.spec.ts

# 2b. Or mount it into the web UI (temporary, via the patch layer)
pnpm dsh web --patch examples/sql-check-tool/sql-check.patch.yml
```

> Note: web HMR is disabled by default in release builds, so you must restart
> the web process after adding a plugin for the tool to appear.
>
> Note: an entry's `name` in a patch resolves against the **profile directory**
> (`~/.dsh/profiles/web/`), not against this file. `sql-check.patch.yml` uses
> a relative path plus a junction under the profile directory; create the
> junction once before first use (Windows, no admin rights):
>
> ```sh
> cmd //c "mklink /J %USERPROFILE%\.dsh\profiles\web\examples <deepseek-harness>\examples"
> ```
>
> To avoid junctions, switch to an absolute `file:///` URL (rules at the top
> of that file; a DSH_HOME-on-same-drive relative hop and bundle install are
> the other two alternatives).

In the web UI, ask the model something like *"Use sql_check to verify
`SELECT FROM WHERE`"* — the model calls the tool and receives the structured
result. Verified end-to-end (2026-08-16): the model autonomously invoked
`sql_check`, read the structured `{ valid: false, errors: [{ type: 'syntax', ... }] }`
result, and reported *"syntax error near \"FROM\""*; reopening the session
replays the tool-call card, tool result, and model reply from the session log,
and the session's trajectory view shows the `sql_check` invocation (tool name,
arguments, result) as raw events. This is the full three-layer verification:
dump-config (mount), tests (behavior), and a real model turn (web E2E).

## Design

A tool is the mirror image of a command: commands are deterministic actions a
human triggers without a model turn; **tools are actions the model chooses to
call on its own**. The tool therefore speaks the model's language:

- **The canonical value is JSON, not prose.** `sql_check` returns
  `{ valid: boolean, errors: [{ type, message }] }`. A model can branch on
  `valid` and read each failure directly instead of parsing text.
- **A bad domain outcome is still a successful result.** Invalid SQL does not
  throw — it is `{ valid: false, errors: [...] }`, a perfectly normal canonical
  value. Throws are reserved for infrastructure failures (here: anything that
  is not a plain SQLite error). This is the cookbook rule that makes tool
  failures routable instead of crashing the agent loop.
- **Errors are classified for the caller.** SQLite's raw messages are mapped
  onto `syntax` / `no-such-table` / `empty` / `other` so the model (or a policy
  hook) can react per class.
- **The UI card is a pure projection.** `presentCall` / `presentResult` are
  pure functions of `args` and the persisted `presentationMeta` — they run on
  live streaming AND on session-log replay, so they must never touch I/O or
  session state. The completed card title (`sql_check: valid` /
  `sql_check: 2 error(s)`) is rebuilt from `meta` on replay.
- **Zero third-party dependencies.** The checker is the real SQLite parser via
  Node's built-in `node:sqlite` (`DatabaseSync`), the same choice the dsh
  `session-query-sqlite` package makes. A fresh `:memory:` database per call
  gives authoritative parsing with no persistence and no cross-call state.

> **Deeper: why must presenters stay pure?**
>
> `presentCall` / `presentResult` run in two very different situations: on the
> live stream while a call is happening, and during session-log **replay** when
> you reopen an old session. Replay has no live state, no I/O, no clock — the
> card must be rebuilt purely from `args` and the persisted
> `presentationMeta`. If a presenter ever read a session or hit the network,
> the replayed session would crash or render differently from what actually
> happened. `defineTool` also soft-guards presenters: bad historical arguments
> fall back to the generic card instead of throwing.

The honest boundary: the checker speaks **SQLite dialect only**. SQL written
for MySQL or PostgreSQL may pass or fail per SQLite's grammar; the description
tells the model this.

## How to develop

```
sql-check-tool/
├── src/index.ts                 # the plugin: name / inject / apply
├── tests/sql-check-tool.spec.ts # 8 cases, real ToolRuntime + SystemPrompt
├── cordis.yml                   # test composition (system-prompt + tools + plugin)
└── sql-check.patch.yml          # web overlay entry
```

> Relationship note: this directory is the complete source + test package for
> the `sql_check` tool; `notes/2026-08-16-sql-check-tool.md` records the
> learning notes behind it.

- `src/index.ts` — `name = 'sql-check-tool'`, `inject = ['tools']` (Cordis
  waits for the tool registry), registers `sql_check` via `defineTool`.
- `tests/sql-check-tool.spec.ts` — mounts the real `SystemPrompt` + `ToolRuntime`
  and executes through `ctx.tools.execute()` (the same boundary as the agent
  loop). Eight cases cover registration + schema flow into system-prompt
  assembly, valid SQL, multi-statement scripts, syntax-error classification,
  no-such-table classification, blank-input handling, automatic parameter
  validation, and presenter purity.

Run the tests:

```sh
pnpm exec vitest run examples/sql-check-tool/tests/sql-check-tool.spec.ts
```

## How to ship

Same path as the helloworld-command example: this directory is a **teaching
example**, not an installable package. To distribute it, promote it to a
standard bundle under `packages/` following the
[packaging tutorial](../../docs/user/develop/basic/publish.md), then install
with `dsh plugin --profile <name> add <package>`. Nothing in this example
needs a build step on the consumer side (`node:sqlite` ships with Node).
