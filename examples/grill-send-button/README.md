# grill-send-button

English | [中文](README.zh.md)

A single extra button in the chat composer. Click it and a preset phrase,
`grill me`, lands in the input and gets submitted — the model answers exactly
as if you had typed it and pressed Enter yourself.

That button is a **pure Client plugin**, and that is the whole point of this
practice. Every earlier one (helloworld-command → laundry-demo) registered
things into the Node process: commands, tools, services, session events. This
one is the first whose entire surface is the web UI. It finds a place to stand
through the **slot system**, receives the session's `inputActions` through the
slot's standard props, and pushes its message into the conversation through
the **composer's own submit path** — no Host API, no custom remote, no second
sending channel. If you have a UI-only idea for dsh, this is the shape it
takes.

## Running

This directory is the **authoritative source**. Copy it into the
deepseek-harness source tree (the copy there may be stale), then work from
the deepseek-harness root:

```sh
# 1. Copy into the deepseek-harness source (this repository is authoritative)
cp -r examples/grill-send-button ../deepseek-harness/examples/grill-send-button

# 2. Run the tests (5 cases, in-process, no browser)
cd ../deepseek-harness
pnpm exec vitest run --config examples/grill-send-button/vitest.examples.config.ts examples/grill-send-button
```

The spec is deliberately pure Node: it pins the exported contract
(`name` / `inject` / `GRILL_TRIGGER`), the busy guard in `buildGrillSend`, and
`apply`'s fail-safe when the `slots` service is absent. What it cannot do is
mount the button — registering into `conversation.input.right` needs the live
web shell, which no Node mount can provide. That half is verified in the
running GUI through the dynamic Cordis flow, zero restart and zero build; see
[Verify live in the GUI](#verify-live-in-the-gui).

## Design

### A list slot: a new `id` adds, it does not replace

The target is the slot `conversation.input.right` — the tool row of the chat
input. It is a `list` slot, and every registration into a list slot carries an
`id`. A brand-new `id` (here `grill-send`) adds one more control to the row
next to the existing ones; only reusing somebody else's `id` would replace
that position. That `id` is the boundary between "add one thing" and "take
over a thing", and it is why you need not fear clobbering the composer's own
controls.

### The registration waits inside `slots.inject`

The slot belongs to the web shell (or another plugin), which may not exist yet
when this plugin loads. So the registration is wrapped:

```ts
slots.inject('conversation.input.right', () => slots.register({
  name: 'conversation.input.right',
  id: 'grill-send',
  order: 1,
  label: () => 'Send grill',
}, SendGrillButton))
```

`inject` runs the callback only once the target slot is actually declared, and
revokes the registration if the declaring plugin unloads. Registration itself
is a Cordis side effect: when this plugin's fiber is disposed, the button
disappears on its own — no manual cleanup.

### The click walks the composer's own path

A session-scoped slot component receives standard props, and among them is
`inputActions` — the same actions the composer itself uses to type and send.
The click therefore does nothing clever:

```ts
inputActions.setDraft('')          // clear whatever is being typed
inputActions.setDraft(message)     // put the preset phrase in
inputActions.submit()              // the ordinary submit queue
```

`submit()` hands the message to the exact path a human's Enter takes:
adjudication, `session.prompt`, the model turn. The plugin is only pressing
the keys for you. It never writes session events, never touches model
requests, never builds a second sending channel — which is the discipline
laundry-demo taught from the other side (the Client reads the durable session
log; it does not invent its own way in).

The one thing the click must respect is the input machine's busy state. While
a message is being adjudicated or submitted (`input.phase` is
`'adjudicating'` / `'submitting'`), firing another `submit()` would interrupt
the one in flight, so the button goes `disabled`. That decision lives in a
pure function:

```ts
export function buildGrillSend(busy: boolean): string | null {
  if (busy) return null
  return GRILL_TRIGGER
}
```

> **Deeper: why the decision is a pure function** — a click handler that reads
> `input.phase` and calls `submit()` is inseparable from React and the slot
> runtime, so it can never run under Node. Splitting the *decision* out of the
> *effect* makes the whole busy contract testable in a plain spec, and leaves
> the component a thin shell that only disables the button and forwards the
> click. The same seam is what the sql_check and csv_query practices call
> presenters: pure logic in front, side effects at the edge.

### `GRILL_TRIGGER` is a product contract

The button's only behaviour is the text it sends, so the text is exported as
one constant and pinned by a test. Changing the phrase later turns the spec
red immediately — safer than a string scattered inside a component.

### Why `src/index.ts` imports nothing

The file is written to serve two masters. For the dynamic flow below, its
`apply` body is pasted into the GUI as plain JS (`code.client`), where module
imports cannot resolve — so there are none; even `React.createElement` is used
directly instead of an import. For a static package, the same body becomes the
repo Client plugin's `apply` under the standard `name` / `inject` / `apply`
exports. What you read in `src/index.ts` is exactly what runs in both worlds.

## Verify live in the GUI

The browser half is proved by the dynamic Cordis plugin flow in a running dsh
web session:

1. Open a session in the web GUI and go to the dynamic-plugin surface
   (`cordis_define` a plugin whose `code.client` is the object exported by
   `src/index.ts`, JS flavour — strip the type annotations).
2. `cordis_run` to activate it, then approve the plugin in the GUI.
3. The ⚡ Grill button appears in the composer tool row. Click it while idle:
   `grill me` is submitted and the model answers. Click it while a message is
   in flight: the button is disabled.
4. Remove the plugin when done — everything it registered disappears with it.

No restart, no rebuild, no bundle. That is the fast loop for "does the idea
work"; it is also why the spec above can stay so small.

## How to distribute

This directory is also an **independently installable npm bundle** (teaching
source and installable package share one home), named
`@smileonroad/dsh-grill-send-button` and declaring both `dsh.client` and
`dsh.bundle`: installed, it adds the ⚡ Grill button to the web chat input.

**Package gates (scripts live in `scripts/`)**

```sh
npm install         # devDependency esbuild for the build
npm run build       # TS → ESM, emits lib/client.js and lib/index.js
npm run verify      # static gates: manifest / exports / dsh.client / artifacts / ./client runtime contract
```

Behaviour tests still run through the per-example vitest config (copy into
deepseek-harness and run from its root, see "How to run"). `lib/` is
prebuilt and ships with the package, so consumers need no toolchain.

**Install and use in dsh**

The package declares `dsh.bundle`, so it installs through dsh's official
plugin channel. Once a profile lists it, the package's own `cordis.patch.yml`
joins the boot tree as one more configuration layer (its row names the package
itself, resolved by Node to the installed code), and the web client-modules
service reads the same package's `dsh.client` declaration to serve the browser
half into `window.__DSH_BOOT__`:

```sh
# run from the xzz-dsh-plugin repository root; relative specs anchor to the
# directory you invoke dsh from
dsh plugin --profile web add ./examples/grill-send-button
```

`dsh plugin --profile <name> add <spec>` forwards its remaining arguments
verbatim to pnpm inside the profile directory, then reconciles the profile:
a dependency that **declares `dsh.bundle`** is appended to
`dsh.profile.bundles` and activated; one without it installs as a plain
dependency with a warning. The spec may be any pnpm-installable form — a local
directory (`.` / `../` / `file:` / `link:`), an npm name, git
(`github:` / `git+ssh:`, pinnable with `#commit`), or a tarball. This package
meets every activation condition:

| Condition | This package |
|---|---|
| `dsh.bundle.patch` points at `cordis.patch.yml` | ✅ reconcile classifies it as a bundle |
| `cordis.patch.yml` inserts a row `id: grill-send-button`, `name: '@smileonroad/dsh-grill-send-button'` | ✅ mounts the node half `lib/index.js` (empty stub) |
| `dsh.client {platform:'web'}` + `exports["./client"]` | ✅ client-modules injects the browser half into the boot graph |

After installing you **must restart the web process**: the bundle list is read
at boot, `patchReload: live` hot-reloads only the profile's own
`cordis.patch.yml`, and client-modules caches package metadata until restart.
After the restart the ⚡ Grill button appears beside the chat input and behaves
exactly as described under "Verify live in the GUI".

> Note: a git install fetches repository sources — this package commits its
> `lib/`, so a git install works as-is with no `prepare`-script allowlist. But
> the package lives in a monorepo subdirectory, and a git spec can only install
> a repository root; for cross-machine distribution publish to npm, split a
> standalone repo, or ship a tarball from `pnpm pack`.

Package-layout and Client-plugin mechanics live in `docs/plugin-package.md`
and `docs/client-plugin.md`.

## Structure

```text
grill-send-button/
├── package.json                    # package manifest (dsh.bundle / dsh.client / exports ./client / files)
├── cordis.patch.yml                # bundle layer: one row mounting this package (dsh.bundle.patch target)
├── src/index.ts                    # the plugin: contract + apply (no imports, TS)
├── src/host.ts                     # empty Host half (pure-Client package convention)
├── scripts/build.mjs               # esbuild TS→ESM into lib/
├── scripts/verify.mjs              # independent-package static gates
├── lib/                            # prebuilt artifacts shipped with the package (client.js etc.)
├── tests/grill-send-button.spec.ts # pure Node spec pinning the contract
├── vitest.examples.config.ts       # per-example vitest config (run in harness)
├── README.md / README.zh.md        # this file, bilingual
└── LICENSE
```

## License

MIT
