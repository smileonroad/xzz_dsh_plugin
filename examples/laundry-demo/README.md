# laundry-demo

[English](README.md) | 中文

A coin laundromat. When the model decides to wash something it calls
`laundry_start`; the machine starts to spin and a laundry card appears in the
chat — the drum percentage climbing, then a warm "done". Ask it to wash a
shirt and watch the card fill up.

That card is a **Client conversation node**, and this is the first practice
that writes browser-side plugin code. Every previous practice
(helloworld-command → gatehouse-demo) ran in the Node process: commands,
tools, services, events. The laundromat's Host half still does — `laundry_start`
is a tool that appends `laundry/start`, `laundry/progress` and `laundry/done`
to the session log. The Client half lives in the browser: a **Definition**
folds that event family into one keyed chat node, and a renderer draws the
card. The two halves never meet; only the durable session log connects them.

## Running

This directory is the **authoritative source**. Copy it into the
deepseek-harness source tree (the copy there may be stale), then work from
the deepseek-harness root:

```sh
# 1. Copy into the deepseek-harness source (this repository is authoritative)
cp -r examples/laundry-demo ../deepseek-harness/examples/laundry-demo

# 2. Run the tests (3 specs, 21 cases, in-process)
cd ../deepseek-harness
pnpm exec vitest run --config examples/laundry-demo/vitest.examples.config.ts examples/laundry-demo
```

The tests are the behavioral gate: they drive the **real**
`ConversationNodeAssembler` with fixture session events (the `laundry/*`
family the tool appends) and pin the Definition against the cookbook's six
verification points. They also drive the Host tool through the real
`ToolRuntime`. No browser is opened and no model key is needed.

To mount the Host half into a running profile (web or headless), apply the
patch — see the rules at the top of `laundry.patch.yml` for entry-name
resolution and the junction trick:

```sh
pnpm dsh web --patch examples/laundry-demo/laundry.patch.yml
```

Ask the model to wash something: the tool records the cycle, and the session
log (visible in the web trajectory panel, or replayable headless) contains
the `laundry/*` family. Seeing the card in the browser itself needs the
Client half built as a bundle — see [How to distribute](#how-to-distribute).

## Design

### Session events: what a Client can see

The whole practice hinges on one distinction. A cordis event
(`ctx.emit('tea/ready')`) is live: it exists the moment it fires and is gone
afterwards. A **session event** (`agent.session.append('laundry/start', …)`)
is a durable, sequence-numbered entry in the session log — replayable
forever, pageable from history. The Client half may only consume session
events: it never reads live memory, and every card it renders must be
reconstructible from the log alone. That is what "the client is a projection
of the session" means — this practice moves the tea-shop event family from
live dispatch into the durable log, and moves the consumer into the browser.

### The story, mapped

| Laundromat | conversation-node seam |
|---|---|
| insert a coin → the drum starts | `laundry/start` (the one start, stable `laundryId`) |
| the drum ticks 45% → 60% | `laundry/progress` (update, frequent delta) |
| spin ends, open the door | `laundry/done` (update, terminal) |
| a laundry card in the chat | Definition → keyed chat node (`laundry-job`) |
| scrolling history still shows it | events replay from the log |
| two machines, each spins its own | same kind, two ids → two Contexts |

### The Host half: a tool that records

`laundry_start` (in `src/machine.ts`) is an ordinary root-scoped tool with one
trick: its `execute` reads `exec.agent` and appends to that agent's session.
It writes `laundry/start` first (allocating a stable `laundry-<n>` id), then
arms a timer chain that appends `laundry/progress` `steps` times and closes
with `laundry/done`. The cycle is cancellable, and unloading the plugin
cancels every running cycle. Without a live agent there is no log to write
to, so the tool throws — the call fails loud instead of silently doing
nothing.

The event vocabulary itself (`src/events.ts`) is a **pure-type export**: the
`SessionEventMap` declaration merge and the payload types live here, so a
consumer imports them type-only and never drags Host code into the browser
bundle.

### The Client half: Definition and keyed node

The Client plugin (`src/client/`) does two things in `apply`:

- `ctx.conversationEvents.register(laundryDefinition)` — "laundry events are
  mine".
- `ctx.slots.inject('conversation.chat.node', () => ctx.slots.register(
  { name: 'conversation.chat.node', key: 'laundry-job' }, LaundryNodeView))`
  — "cards of kind `laundry-job` are drawn by my renderer".

The **Definition** (`definition.ts`) is the brain. The cookbook's discipline:

- `match(event)` is an **identity extractor, not a fold**: it sees exactly one
  event and returns `{ id, role }` or null. `laundry/start` starts the
  context; `laundry/progress`/`laundry/done` update it. One event, one match —
  the engine keeps the append hot path constant-time.
- `start`/`update` return new immutable State. There is no "latest unfinished
  cycle" guessing: the id travels in every event's payload, so two machines in
  the same window update their own cards.
- `buildViewNode` projects State into the renderer's `data`, always under the
  same `context.key`. A materialized node is never withdrawn — temporarily
  leaving the visible flow would use `visibility: 'hidden'`, not null.

The kind is registered by merging the ui-conversation contract:

```ts
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    'laundry-job': LaundryChatData
  }
}
```

and the chat view dispatches each node by `kind` through the keyed
`conversation.chat.node` slot — our renderer is only asked to draw
`laundry-job` nodes, and it may draw nothing else.

### Three intake paths, one replay

The engine feeds the log to every Definition through three paths, and each is
pinned in the tests:

| path | when | what the Definition sees |
|---|---|---|
| replace | open / resync / gap repair | the whole loaded window, replayed in `seq` order |
| prepend | an older page loads | only the new older events; existing keyed nodes keep their identity |
| append | one live event | one `match`, then one `start`/`update` — no window scan |

The same event family therefore produces the same cards whether it streams in
live (append) or is reconstructed from history (replace + prepend) — that is
what replayability buys. The `publication` field then decides when a State
change becomes a visible node:

| event | cadence | why |
|---|---|---|
| `laundry/progress` | `'animation-frame'` | frequent visible deltas merge into one paint per frame |
| `laundry/start` / `laundry/done` | `'immediate'` | structural/terminal changes should not wait |

`append` returns the requested cadence, so the tests assert it directly, and
"at most one publish per frame" is pinned by appending two progress ticks and
flushing once.

### Renderer discipline: pure projection

The renderer (`view.tsx`) reads only `node.data` and delegates every decision
to a React-free projection (`presentation.ts`):

```ts
projectLaundry(data) // → { line, barWidth } or { line, barWidth: null }
```

The card has no other logic: one line of text, plus the drum bar exactly
while the cycle is still running. That projection is what the tests pin —
every data shape the Definition can produce, asserted without a component
runtime.

> **Deeper: why the tests render no React component.**
>
> Under pnpm's strict `node_modules`, `react` is linked only into packages
> that declare it; an examples directory has no package manifest, so a jsdom
> spec there cannot resolve `react` (this is a repo-layout fact, not a choice
> of this example). The practice answers the cookbook's "renderer consumes
> only `node.data`" point structurally: the component is a thin mapping from
> `node.data` through `projectLaundry` to markup, and every branch of that
> mapping is covered by the projection tests. When the client half is built
> as a real bundle (see below), it typechecks and runs inside the react
> ecosystem like any other client package.

## How to develop

```
laundry-demo/
├── src/
│   ├── events.ts           # producer types: SessionEventMap merge + payloads (pure type export)
│   ├── machine.ts          # Host half: laundry_start tool, timer-driven cycle, cancellable
│   └── client/
│       ├── definition.ts   # Client half: ConversationNodeDefinition + ChatNodeDataMap merge
│       ├── presentation.ts # pure card projection (React-free, testable from examples)
│       ├── view.tsx        # thin renderer: node.data → projectLaundry → markup
│       └── index.ts        # apply: register Definition + keyed slot renderer
├── tests/
│   ├── laundry-machine.host.spec.ts      # 8 cases — real ToolRuntime + fake agent
│   ├── laundry-definition.client.spec.ts # 8 cases — real ConversationNodeAssembler
│   └── laundry-view.client.spec.ts       # 5 cases — pure projection, every data shape
├── cordis.yml            # composition: Host half + Client half
└── laundry.patch.yml     # profile overlay (Host half only)
```

- `src/events.ts` — nothing but types. The `declare module
  '@deepseek-ai/dsh-session/types'` merge is what makes
  `session.append('laundry/start', …)` and `event.type === 'laundry/start'`
  typed on both halves. The Client file imports it with `import type {}` —
  the same type-only side-effect import the cookbook prescribes across a real
  package boundary.
- `src/machine.ts` — `name = 'laundry-machine'`, `inject = ['tools']`. The
  tool allocates `laundry-<n>` ids, appends the start, arms `steps` progress
  ticks then the done event, and keeps the timer chain in a map so unload
  cancels it. No agent → throw; bad args → throw (the runtime turns a thrown
  body into `isError` with the message).
- `src/client/definition.ts` — `kind: 'laundry-job'`, `target: 'chat'`.
  `match` extracts the id, `start` seeds `{ title, completed: 0, status:
  'running' }`, `update` folds progress/done, `publication` maps the cadence,
  `buildViewNode` emits the full chat node under a stable key.
- `src/client/presentation.ts` / `view.tsx` — the whole renderer behavior
  lives in the pure projection; the component is the thin shell shown above.
- `tests/laundry-definition.client.spec.ts` — drives the real
  `ConversationNodeAssembler` with fixture events and pins the cookbook's six
  verification points: full replace yields the final State, Location data,
  node payload and `anchorSeq`; an updates-only window stays pending until the
  start prepends, matching the full replace; realtime append equals a merged
  replay; prepend adds only earlier rows and leaves unchanged keyed values
  untouched; repeated visible deltas keep `context.key` and request
  `animation-frame` (at most one publish per frame); and the renderer
  consumes only `node.data` (pinned structurally — see the pure-projection
  story above). On top of the six: `match` is called exactly once per event,
  two cycles in one window update independently, and the start guard trips on
  a non-start match.
- `tests/laundry-machine.host.spec.ts` — mounts `SystemPrompt` + `ToolRuntime`
  (real services) with a fake agent, dispatches through `ctx.tools.execute`,
  and drives the cycle with fake timers: event order, tick timing, arg
  handling, no-agent failure, invalid args, disposer cancellation, Loader-safe
  exports.
- `tests/laundry-view.client.spec.ts` — every `projectLaundry` branch:
  running text + bar width, 0%/99% edges, completed summary, summary-less
  completion, and the merged kind/target.

Run the tests:

```sh
pnpm exec vitest run --config examples/laundry-demo/vitest.examples.config.ts examples/laundry-demo
```

> Relation note: this directory is the complete source + test package of the
> Client-conversation-node practice; `notes/2026-09-02-laundry-demo.md`
> records the learning behind it, and the shaping proposal is at
> `docs/proposals/2026-09-02-laundry-demo.md`.

## How to distribute

Consistent with the other examples: a **teaching example**, not an
installable package. Two halves, two distribution stories:

- The **Host half** mounts through the patch layer as-is (a source `.ts`
  entry), as the previous examples did.
- The **Client half** reaches a real browser page only through the client
  module system: the page scans loader entries declaring `dsh.client` and
  serves each package's built `./client` export — no web-app rebuild needed,
  but the package must exist as a built bundle with that export. Promoting
  the example follows the standard packaging path (the cookbook's
  `adding-a-conversation-node` and the packaging tutorial), at which point
  the card appears in the chat of any profile that mounts the plugin.
