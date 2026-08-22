# events-demo example

English | [中文](README.zh.md)

A **typed-events practice on real harness events**: two plugins that listen to
the `tools/*` waterfall events (`tools/pre-execute`, `tools/post-execute`) —
the same interception points the harness itself uses for tool policies and
audit — plus the real `commands/change` emit event. It demonstrates the second
plugin-coupling mechanism after service keys: **plugins never import each
other, they couple through typed events on `ctx`**.

## Running

This directory is the **source of truth** for the example. To run it, first
copy it into the deepseek-harness source's `examples/` (the copy over there may
be stale), then operate from the deepseek-harness root:

```sh
# 1. Copy into the deepseek-harness source (this repo is the source of truth)
cp -r examples/events-demo ../deepseek-harness/examples/events-demo

# 2a. Run the tests
cd ../deepseek-harness
pnpm exec vitest run examples/events-demo/tests/events-demo.spec.ts

# 2b. Or mount it into the web UI (temporary, via the patch layer)
pnpm dsh web --patch examples/events-demo/events.patch.yml
```

> Note: events plugins have **no visible UI**. Mounted in web they show
> nothing by themselves — the meaningful verification for this example is the
> test suite (web HMR is disabled in release builds anyway, so a restart would
> be required for any web change). The patch file exists so the demo policy can
> be activated on a running instance if you want it.
>
> Note: an entry's `name` in a patch resolves against the **profile directory**
> (`~/.dsh/profiles/web/`), not against this file. `events.patch.yml` uses a
> relative path plus a junction under the profile directory; create the
> junction once before first use (Windows, no admin rights):
>
> ```sh
> cmd //c "mklink /J %USERPROFILE%\.dsh\profiles\web\examples <deepseek-harness>\examples"
> ```

## Design

Services are "I need your capability, give it to me". **Events are "I don't
know who is listening, I just shout"**. The harness itself runs on events —
`tools/pre-execute` is how a policy allows / denies / asks before a tool runs,
`tools/post-execute` is how a wrapper accepts / replaces / blocks a result, and
`commands/change` fires whenever the command registry mutates. This example
listens to those real events instead of declaring its own (declaring and
emitting your own events is the next practice).

The two plugins are the two roles a waterfall chain allows:

```
tools/pre-execute (waterfall, outermost listener runs first)
    │
    ▼
┌───────────────────────────────┐
│ tool-observer (observer)      │  MUST call next() — it only records.
│    │ return next()            │  Forgetting next() silently bypasses
│    ▼                          │  every downstream decider.
│ tool-policy (decider)         │  MAY return without next() — that vetoes
│    │ allow? → next()          │  the chain and the tool never runs.
│    │ deny?  → {kind:'deny'}   │
│    ▼                          │
│ tool body runs (or is denied) │
└───────────────────────────────┘
```

Rules that fall out of this split:

- **An observer must delegate.** `tool-observer` calls `next()` on both
  `tools/pre-execute` and `tools/post-execute`. The discipline test registers
  a listener that returns `{ kind: 'allow' }` *without* calling `next()` and
  proves the decider never gets to deny — the blocked tool runs anyway.
- **A decider owns its decision.** `tool-policy` returns
  `{ kind: 'deny', reason }` for blocked tools without calling `next()`, and
  the denied call settles as an error result (`Error: denied by policy`).
- **Listeners are effects.** `ctx.on` registers a listener that disappears
  with the plugin; the returned disposer removes it on demand.
- **Distribution modes.** Real harness events are almost all `emit` (fire and
  forget) or `waterfall` (middleware chain). `serial` / `bail` / `parallel`
  mostly live inside Cordis internals, so this example exercises them through
  small test-fixture events rather than pretending they are everyday product
  events.

## How to develop

```
events-demo/
├── src/tool-observer.ts      # observer: tools/pre-execute + post-execute, always next()
├── src/tool-policy.ts        # decider: tools/pre-execute, denies a block list
├── tests/events-demo.spec.ts # 10 cases, real ToolRuntime + CommandRuntime
├── cordis.yml                # composition: observer + policy
└── events.patch.yml          # web overlay entry
```

> Relationship note: this directory is the complete source + test package for
> the typed-events practice; `notes/2026-08-22-events-demo.md` records the
> learning notes behind it. The proposal that shaped it lives in
> `docs/proposals/2026-08-22-events-demo.md`.

- `src/tool-policy.ts` — `name = 'events-demo-tool-policy'`,
  `inject = ['tools']` (mount after the tool registry), listens to
  `tools/pre-execute` and denies tools on a block list by returning
  `{ kind: 'deny', reason }` without `next()`. Everything else delegates via
  `next()`.
- `src/tool-observer.ts` — the observer counterpart: listens to
  `tools/pre-execute` and `tools/post-execute`, records nothing visible and
  always delegates. It exists to model the *correct* observer — the discipline
  test shows what happens when an observer forgets `next()`.
- `tests/events-demo.spec.ts` — mounts the real `SystemPrompt` + `ToolRuntime`
  (same harness as sql-check-tool) or `CommandRuntime`, and drives real
  boundaries: `ctx.tools.execute()` (the agent-loop entry) and
  `ctx.commands.register()`. Ten cases cover the real emit event, the
  disposer, deny / allow, good-observer delegation, the forgot-next
  discipline, serial / bail / parallel modes (fixture events), and
  Loader-safe exports.

Run the tests:

```sh
pnpm exec vitest run examples/events-demo/tests/events-demo.spec.ts
```

## How to ship

Same path as the other examples: this directory is a **teaching example**, not
an installable package. To distribute it, promote it to a standard bundle under
`packages/` following the
[packaging tutorial](../../docs/user/develop/basic/publish.md), then install
with `dsh plugin --profile <name> add <package>`.
