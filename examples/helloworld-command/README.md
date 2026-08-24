# helloworld-command example

English | [中文](README.zh.md)

A minimal human-facing slash command plugin: `/helloworld [<name>]` greets the
user without a model turn. It demonstrates the [`ctx.commands`](../../packages/interaction/commands/README.md)
extension point, the smallest complete command plugin in the repository.

## Running

This directory is the **source of truth** for the plugin. To run it, first
copy it into the deepseek-harness source's `examples/` (the copy over there may
be stale), then operate from the deepseek-harness root:

```sh
# 1. Copy into the deepseek-harness source (this repo is the source of truth)
cp -r examples/helloworld-command ../deepseek-harness/examples/helloworld-command

# 2a. Run the tests
cd ../deepseek-harness
pnpm exec vitest run examples/helloworld-command/tests/helloworld-command.spec.ts

# 2b. Or mount it into the web UI (temporary, via the patch layer)
pnpm dsh web --patch examples/helloworld-command/helloworld.patch.yml
```

> Note: web HMR is disabled by default in release builds, so you must restart
> the web process after adding a plugin for the command to appear.
>
> Note: an entry's `name` in a patch resolves against the **profile directory**
> (`~/.dsh/profiles/web/`), not against this file. `helloworld.patch.yml` uses
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

Verified end-to-end in the web UI (2026-08-16), four layers: (1) typing `/`
lists `helloworld` in the command menu; (2) executing `/helloworld <name>`
renders the command node in the chat stream within ~1s (no model turn);
(3) each execution leaves a paired `command/run` + `command/done` record in
the session log; (4) reopening the session replays the command node from the
log, and the session's trajectory view lists every turn's events (command
input, tool calls, results) in order.

## Design

Commands dispatch straight from a human's command line to a handler without
any model request. For deterministic, human-driven actions this is the right
shape, as opposed to tools, which the model calls on its own.

Three decisions drive the design:

- **`inject: ['commands']` declares the dependency.** Cordis waits for the
  command registry to be ready before loading the plugin, so reading
  `ctx.commands` in `apply` is safe.
- **`register` is a side effect.** Disposing the plugin fiber unregisters the
  command. A registration never outlives its owner.
- **The handler owns its grammar.** `invocation.rawInput` is the exact text
  after the command name (separator included); `parseName` decides what counts
  as a greeting target and what is a usage error. No other package owns the
  greeting vocabulary.

The command does not own the session event stream, the command registry itself
records the lifecycle (`command/run`/`command/done`), so there are no package
invariants to assert beyond the domain's own behavior.

> **Deeper: why does `rawInput` include the separator whitespace?**
>
> `rawInput` is the verbatim text after the command name — `/helloworld 小明`
> gives `" 小明"` with the leading space, because the registry keeps the
> separator as part of the raw input. The handler must `trim()` before
> parsing, or it will keep "seeing" a spurious leading space. This trips up
> almost every first plugin (the note records it as a classic pitfall); the
> trick is to log `rawInput` during a test run and see the space with your own
> eyes.

## How to develop

```
helloworld-command/
├── src/index.ts                 # the plugin: name / inject / apply
└── tests/helloworld-command.spec.ts
```

> Relationship note: this directory is the complete source + test package for
> the `/helloworld` plugin; `notes/2026-08-15-helloworld-command.md` records
> the learning notes behind it.

- `src/index.ts` — `name = 'helloworld-command'`, registers the `/helloworld`
  command. A `CommandResult` is direct UI output: `{ kind: 'success', text }`
  or `{ kind: 'error', text }`.
- `tests/helloworld-command.spec.ts` — boots a real `CommandRuntime` and
  session store, stubs an agent, and executes `/helloworld` through
  `ctx.commands.execute()` (the same boundary as a UI adapter). Six cases
  cover registration, plain greeting, named greeting, multi-word rejection,
  lifecycle events, and admission miss.

If you also want to verify the plugin mounting into the **real Loader
composition tree** (booting a `cordis.yml` via the app bin), follow the
`runLoaderSmoke` pattern in the dsh source's `examples/headless-agent/tests/`
(`packages/test-support/loader-smoke`); the earlier
`tests/web-load.spec.ts` + `tests/fixtures/helloworld-driver.ts` were only a
teaching copy of that pattern and have been deleted.

Run the tests:

```sh
pnpm exec vitest run examples/helloworld-command/tests/helloworld-command.spec.ts
```

## How to ship

This directory is currently a **teaching example**, not an installable
package: it has no `package.json`, so `dsh plugin add` cannot consume it. To
distribute it to other users, promote it to a standard bundle under
`packages/` following the [packaging tutorial](../../docs/user/develop/basic/publish.md):

1. **Create the package** under `packages/interaction/helloworld-command/`
   with `package.json` (name `@deepseek-ai/dsh-helloworld-command`,
   `private: true`, `dsh.bundle.patch`), `tsconfig.json`,
   `src/invariant.ts`, and bilingual READMEs.
2. **Add a `cordis.patch.yml`** inserting the plugin row by package name so
   the profile mounts it.
3. **Distribute build artifacts.** A git install pulls source, not `lib/`
   output, so add a self-contained `prepare` build script, or publish to
   npm / a tarball so installation needs no build permissions.
4. Users then install via
   `dsh plugin --profile <name> add github:you/helloworld-command#<sha>` (git)
   or `dsh plugin --profile <name> add @deepseek-ai/dsh-helloworld-command`
   (npm), and the profile's `cordis.patch.yml` applies that bundle layer.

The full bundle contract and build-script pitfalls are covered in
[packaging and installing plugins](../../docs/user/develop/basic/publish.md).
