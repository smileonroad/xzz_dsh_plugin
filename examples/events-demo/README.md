# events-demo example

English | [中文](README.zh.md)

Events are how dsh plugins shout without knowing who listens: one plugin
emits (`ctx.emit`), whoever cares listens (`ctx.on`). This example practices
the **listening side** against real harness events — the `tools/*` waterfall
interception points that the harness itself uses for tool policies and audit,
plus the `commands/change` emit event. Declaring and emitting your own events
is the next practice, [tea-shop-demo](../tea-shop-demo/).

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
know who is listening, I just shout"**: one plugin emits with `ctx.emit`,
anyone who cares listens with `ctx.on`. The harness itself runs on events —
`tools/pre-execute` is where a policy allows / denies / asks before a tool
runs, `tools/post-execute` is where a wrapper accepts / replaces / blocks a
result (both are **waterfall** events: a middleware chain where each listener
wraps a `next()` call), and `commands/change` is a plain **emit** event that
fires whenever the command registry mutates. This example listens to those
real events instead of declaring its own — declaring and emitting your own
events is the next practice, [tea-shop-demo](../tea-shop-demo/).

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

> **Deeper: what can a `tools/pre-execute` listener return?**
>
> The decision type is `PreToolDecision`:
>
> - `{ kind: 'allow' }` — run the call (only meaningful if you call `next()`
>   or are the outermost listener; returning it without `next()` short-circuits
>   every later listener)
> - `{ kind: 'deny', reason }` — the call settles as an error carrying that
>   reason (`Error: denied by policy`)
> - `{ kind: 'ask', reason? }` — needs an approval seam; without one mounted it
>   degrades to a deny
>
> `tools/post-execute` answers with `PostToolDecision`: `accept` (optionally
> replacing the result content or value) or `block` (turning the result into an
> error with corrective feedback). These two types are the whole interface of
> the tool-interception points — a policy or audit plugin never touches the
> tool's own code.

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
> the typed-events practice; `notes/2026-08-23-events-demo.md` records the
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
