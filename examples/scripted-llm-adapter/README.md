# scripted-llm-adapter practice

English | [中文](README.zh.md)

Give the harness a model provider that needs **no network and no credential**. This practice is about the harness model boundary. The adapter sits in the middle like a simultaneous interpreter: going in it translates a harness request into a provider request, coming out it translates the provider response back into the one language the harness speaks internally, the **canonical chunk stream**. The agent loop, tool calls, token accounting, and compaction all stand on that contract, and this example lays it out.

It complements the earlier practices: `units-capability` invented a capability seam and practised designing one; this one plugs into a **seam the kernel already has**, and practises being a provider for it.

## Running

This directory is the **source of truth**. To run it, copy it into the deepseek-harness checkout under `examples/` (the copy there can be stale), then work from the deepseek-harness root:

```sh
# 1. Copy into deepseek-harness (this repo is the source of truth)
cp -r examples/scripted-llm-adapter ../deepseek-harness/examples/scripted-llm-adapter

cd ../deepseek-harness

# 2a. Run the tests (the harness vitest workspace no longer covers examples/; use the config shipped here)
pnpm exec vitest run --config examples/scripted-llm-adapter/vitest.examples.config.ts examples/scripted-llm-adapter

# 2b. Offline demo: no key, no network, and your real ~/.dsh is untouched
node examples/scripted-llm-adapter/scripts/demo.mjs "hello"
node examples/scripted-llm-adapter/scripts/demo.mjs "check the permission config"   # blocked words, no model call

# 2c. Mount it into the web UI (optional; published web disables HMR, restart the process)
pnpm dsh web --patch examples/scripted-llm-adapter/cordis.patch.yml
```

The demo script creates a throwaway `DSH_HOME` in a temp directory, writes a `settings.yaml` there (pointing the default model at `scripted/demo`) plus an overlay, and deletes it afterwards. `cordis.patch.yml` alone is not enough because `agent-default-model` belongs to the **settings user layer**, which overrides composition config, and a real home usually already stores a model selection. To use `cordis.patch.yml` directly, first remove the `agent-default-model:` section from `~/.dsh/settings.yaml`.

> A patch entry's `name` resolves against **the directory holding that patch file**, not the profile directory and not the current working directory. `cordis.patch.yml` lives in this directory, so it says `./src/index.ts`; for an absolute path on Windows you must keep the `file:///` prefix, because a bare `D:/...` is read as a URL scheme.
>
> The easily confused counterpart is the profile's own `cordis.patch.yml`, which does resolve against the **profile directory**; that is the one that needs an `examples` junction when it writes `./examples/<name>/...`. Mounting this example with `--patch` needs no junction:
>
> ```sh
> pnpm dsh web --patch examples/scripted-llm-adapter/cordis.patch.yml
> ```

### Verifying in the web UI

Once it is running, check these in order; each one has a clear expectation.

1. The **startup log** should show no `warning: N entry did not activate` and no `failed to import`. Either one means the entry never mounted, so check the path against the `name` rule above first.
2. The **model selector** (the model name above the composer) should list a `Scripted (scripted)` group containing `Scripted demo`. Both come from the adapter's `providerInfo` and `listModels`.
3. **Send `hello`** and the reply should be `[scripted] hello`. If a real model answers normally instead, the old `agent-default-model` value in `~/.dsh/settings.yaml` is overriding the patch; picking the scripted model once in the UI writes the selection back to settings.
4. **Try three more scripts.** `think:think first` emits a reasoning block before the text; `fail:RATE_LIMIT slipped` ends the turn as an error (code `RATE_LIMIT`); `hang:` stops the reply after `partial`, and pressing stop marks that message as interrupted.
5. **Try the guard.** Replace `hello` with a message containing a blocked word; the configured refusal comes back and no model call happens.
6. **The tool round trip.** Write `tool:<tool name> {...}` using a name visible in the UI: the tool really runs, and the second round echoes the result as `[scripted] tool returned …`. Getting the name wrong still exercises the whole loop, with the echo reading `[scripted] tool returned Error: unknown tool "…"`.

## Design

### Who a model call passes through

```
agent loop decides it needs the model
      │  assembles GenerateOptions (history, system prompt, tool schemas, generation params, signal)
      ▼
 ctx.llm.stream(options)
      │  ① llm/stream waterfall: plugins may wrap it here
      ▼
 route selection: options.provider picks the adapter, options.model is the provider model id
      │  ② prepareCall() → resolveModel(): identity, context window, reasoning capability
      ▼
 adapter.stream(options)   ← the method this practice implements
      │  ③ emits canonical chunks
      ▼
 the assembler turns chunks into one assistant message
      │
      ├─ model asked for a tool → tool runs → result goes back into history → another round
      └─ otherwise → the turn ends
```

Only `stream()` is mandatory on this path. `LlmAdapter` provides defaults for `providerInfo` / `listModels` / `resolveModel` / `prepareCall`, and this example overrides them to show two conventions: the catalog is advisory, and capabilities must be declared truthfully. The default `prepareCall` binds the resolved model metadata and this generation's stream entry point into one atomic pair, so a dynamic-catalog adapter cannot combine one generation's capability with another generation's endpoint.

### How a turn is planned

The adapter hands the request to `src/script.ts`, a pure module: it reads the last human message from `GenerateOptions.messages` and derives what this turn should say. A real adapter parses the provider's SSE stream here; this one parses a script, which is what makes the whole example runnable offline.

Two counter-intuitive details live in that message reading, each guarded in code and pinned by a test.

| Symptom | Handling | Why |
| --- | --- | --- |
| A tool-result message has `role: 'user'` | Look for a `tool-result` block, and check the tail of the history separately | The canonical vocabulary reuses the user role for tool results, so role alone would treat one as a fresh instruction and call the tool forever |
| The harness inserts its own user messages into history | Prefer the message whose `source.kind === 'user'` | Workspace instructions and skill catalogs also arrive as user messages, but they are not something a person said |

### In what order chunks are emitted

The protocol obligations are detailed, and `renderTurn()` in `src/script.ts` is their minimal implementation.

| Rule | Why |
| --- | --- |
| Every `block-start` gets a `block-end`, and `block-end` carries the assembled block | The assembler trusts the block in `block-end`; deltas only drive live rendering |
| Block `index` follows first-seen order, and every delta of a block reuses its index | Blocks may stream interleaved, so the index is the only correlation key |
| Tool arguments stay a raw JSON string throughout, with increments in `argumentsDelta` | A model's arguments can be half a JSON document, and parsing early loses information |
| `usage` precedes `finish`, and nothing is emitted after `finish` | Consumers treat `finish` as the end; anything after it is a protocol error |

> **Deeper: these rules are enforced, not merely documented.** `packages/llm/llm/src/invariant.ts` is itself an `llm/stream` waterfall listener registered with `{ global: true, prepend: true }`, so it runs ahead of every plugin. It validates block open/close, whether a delta matches its block type, duplicate `usage`, and whether anything follows `finish`. The deliberately malformed adapter in the spec is what hits that wall: one delta after `finish` ends the stream with `LLM stream emitted text-delta after terminal finish`. The kernel also keeps classifications such as `EMPTY_RESPONSE`, because "finished normally but produced no block at all" must not pass as an empty assistant message, which would make the turn silently do nothing.

### Which path a failure takes

| Path | Used for | What the consumer sees |
| --- | --- | --- |
| The adapter **throws** an `LlmError` with a stable code | transport or protocol failure, unsupported request field | `LlmRuntime.stream()` **normalizes** the exception into a terminal `finish`; the consumer always sees a finish, never an exception |
| The stream ends with `finish { kind: 'error' \| 'aborted' }` | in-band provider failure, cancellation | Also a terminal finish, with `failure.code` supplied by the adapter |

The difference exists only on the adapter side; consumers see the same shape. This example implements both and asserts each: the `fail:` script throws `RATE_LIMIT`, the `provider-fail:` script ends the stream as an error finish, and a mid-stream abort is classified by the runtime from `signal` into `aborted`.

### Capability declaration and registration

What `resolveModel()` declares is genuinely validated. When reasoning capability is declared, the options pass through as the adapter's ordered opaque IDs, including `off`; when a caller explicitly asks for an unsupported level, `LlmRuntime` rejects it **before** calling `stream()`, and a test pins that with "`stream()` was never called". Omitting the level falls back to the adapter's declared default.

Registration has its own rules worth remembering. One route can hold only one adapter, and a duplicate registration throws `DUPLICATE_ADAPTER`; registering several routes either succeeds entirely or fails entirely; the returned handle can be disposed and also supports `replace()` for an atomic route swap that validates everything first and swaps in one synchronous section, leaving no window; calling `replace` after disposal throws `REGISTRATION_DISPOSED`. Registration is a side effect owned by the plugin lifetime, so HMR is safe.

### Interception: answering without a model call

Step ① in the diagram above is a waterfall, so a plugin can wrap the model call or skip it entirely. This example uses that for a blocked-word guard (`src/guard.ts`): when the input contains a word such as "permission" or "password", the guard answers with a configured refusal and the adapter is never called.

That policy deliberately does not live inside the adapter, because a policy should not grow on the provider. Swap in a real model and the adapter changes, while the guard has nothing to do with which model answers; "before the model call" is where it belongs.

| What you want | Which extension point | What it costs |
| --- | --- | --- |
| Answer with your own text and skip the model | The `llm/stream` waterfall (what this example does) | The answer must be a valid chunk stream; the user's original text still enters the session |
| Swallow the step silently | `agent/pre-step` returning `{ kind: 'reject' }` | The turn ends as `blocked`; the original text still produces inbox events |
| Rewrite and let it through (redaction, added context) | `agent/pre-step` returning `{ kind: 'enter', messages }` | The model is still called, just with rewritten content |

Three implementation details are worth remembering. First, the guard inspects the last thing a person said; tool results and harness-injected user messages do not count (both traps are already handled by `lastUserText()`). Second, a non-empty `options.purpose` marks a background call such as compaction or session titling, which must pass through or it gets interrupted. Third, the refusal has to be a **valid** chunk stream, since it goes through the same validation as adapter output; the spec runs it under the package invariant to prove that. No model call happened, so no `usage` is reported.

> **Deeper: why the guard can pass for the model.** To the agent loop, whatever `llm/stream` returns is the answer: it receives canonical text chunks, assembles one assistant message, records it in the session, and the UI renders it. The guard is not lying; it only changes who produced the stream, from a provider API to a local policy. That is also why `llm/stream` is a weighty extension point: retries, compaction, and token accounting all hang off the same place.

## Walking through the core code

Four files, best read as plugin shell, turn planning, streaming, then interception. Together they are under four hundred lines.

### 1. The plugin shell (`src/index.ts`)

```ts
export const name = 'scripted-llm-adapter'
export const inject = ['llm']
export const Config: Schema<Config> = Schema.object({
  providers: Schema.array(Schema.string()).default(['scripted']),
  models: Schema.array(ModelSchema).default(DEFAULT_MODELS),
})
export function apply(ctx: Context, config: Config): void {
  ctx.llm.registerAdapter(config.providers, new ScriptedAdapter(config.models))
}
```

`inject` guarantees `ctx.llm` is ready before `apply` runs. Configuration goes through Schemastery, so both the route name and the model catalog can change in a patch rather than in code. Registration is a side effect, and the plugin's lifetime reclaims those routes, which is what makes HMR safe.

### 2. Planning (`src/script.ts`)

A pure module that touches neither Cordis nor the network, so it can be tested on its own. It does two things: work out what the person said, then work out which chunks this turn should emit.

```ts
export function planTurn(options: GenerateOptions): ScriptedTurn {
  const completed = toolResultText(options)
  if (completed !== undefined) return { kind: 'text', text: `${ECHO_PREFIX}tool returned ${completed}` }
  const prompt = lastUserText(options).trim()
  const match = COMMAND.exec(prompt)
  // ...
}
```

The first two lines are the two traps described earlier. A tool result at the end of the history means this turn should wrap up rather than call the tool again, and `lastUserText()` prefers text whose source is the user, which filters out the reminders the harness injects.

The chunk emission follows the protocol order exactly.

```ts
chunks.push(
  { type: 'block-start', index, blockType: 'tool-call' },
  { type: 'tool-call-delta', index, id, name: turn.name, argumentsDelta: turn.arguments.slice(0, split) },
  { type: 'tool-call-delta', index, id, argumentsDelta: turn.arguments.slice(split) },
  { type: 'block-end', index, block: { type: 'tool-call', id, name: turn.name, arguments: turn.arguments } },
  { type: 'usage', usage: { inputTokens, outputTokens: outputTokens + turn.arguments.length } },
  { type: 'finish', reason: { kind: 'tool-calls' } },
)
```

Arguments are deliberately split into two deltas so that reassembly is visible in a test, and `arguments` stays a raw JSON string throughout: what a model produces may well be half a JSON document at first.

### 3. Streaming (`src/adapter.ts`)

`stream()` is the one required method. It records the request, then branches on the script.

```ts
this.requests.push(options)
if (options.stop !== undefined) throw new LlmError('the scripted provider cannot honour stop sequences', 'UNSUPPORTED_OPTION')
const turn = planTurn(options)
if (turn.kind === 'failure') throw new LlmError(turn.message, turn.code)              // thrown, normalized by the runtime
if (turn.kind === 'empty') throw new LlmError('...', EMPTY_RESPONSE_CODE)
if (turn.kind === 'hang') { /* emit half a block */ await interrupted(options.signal); return }
for (const chunk of renderTurn(turn, options)) {
  if (options.signal?.aborted === true) throw new Error('the scripted stream was aborted')
  yield chunk
}
```

Three branches cover the three failure scripts, and the loop at the end is the normal path. Every chunk checks the cancel signal first, and the hang branch waits on `interrupted()`, which really does wait forever without a signal, exactly what `hang:` is meant to demonstrate. The recorded `requests` array is not only a debugging aid: tests use its length being zero to prove that a path never reached the model.

### 4. Interception (`src/guard.ts`)

```ts
ctx.on('llm/stream', (options, next) => {
  if (options.purpose !== undefined) return next()
  const hit = matchBlockedWord(lastUserText(options), config.words)
  if (hit === undefined) return next()
  return refusalStream(`${config.refusal}（命中：${hit}）`)
})
```

In a waterfall, whoever does not call `next()` becomes the end of the chain. The two pass-through conditions come first, so background calls and clean messages continue as usual; a hit returns a locally built chunk stream, and the adapter is never touched. That refusal stream must itself be valid, or the package invariant rejects it, which a test verifies.

## Script grammar

The start of the last human message decides what this turn says.

| Prefix | Effect | Why it exists |
| --- | --- | --- |
| `think:<text>` | Emits a reasoning block, then a text block | Practises index allocation across blocks |
| `tool:<name> <JSON>` | Emits a tool-call block with arguments as a raw JSON string | Practises the tool-call block and the second round: the tool result comes back and is echoed |
| `fail:<CODE> <text>` | Throws `LlmError` | Practises the transport-failure path and exception normalization |
| `provider-fail:<CODE> <text>` | Ends the stream with an error finish | Practises the in-band failure path |
| `empty:` | Throws `EMPTY_RESPONSE` | Practises degenerate-completion classification |
| `hang:` | Emits half a text block, then waits for cancellation | Practises abort and settling |
| Anything else | Echoes `[scripted] <text>` | Demo and manual play |

## Tests

21 behaviours in five groups. Each group aims at a real runtime boundary rather than at internal functions.

**One full conversation turn.** The harness's own test kit (`agent-loop-testkit`) mounts the production `AgentLoop`, the plugin is installed like any other plugin, and the test sends a message the way a user would. Three things are checked: whether what the model said assembles into one assistant message, whether the usage numbers come out right, and whether a tool can actually be driven (sending a script like `tool:echo {"text":"hi"}` runs two rounds, with the arguments staying a raw JSON string the whole way). One case guards a trap: the harness inserts user-role messages of its own making into the history (workspace instructions, skill catalogs), and the test confirms the model does not mistake one for something a person said. It also pins a counter-intuitive detail: the session log stores the packed form of the stream, where consecutive deltas collapse into one record, not the adapter's raw chunks.

**The protocol on its own.** These read `ctx.llm.stream()` directly, without an agent in front. Block order and indexes; a deliberately malformed stream (one extra delta after `finish`) being rejected by the kernel's invariant; an adapter throw arriving as a well-formed error finish; and whether in-band failure, `UNSUPPORTED_OPTION`, `EMPTY_RESPONSE`, and a mid-stream cancel each take the path they are supposed to.

**Capability declaration.** Declared reasoning levels have to be honoured: when a caller explicitly asks for an undeclared level, `stream()` must never be called; when the caller stays silent, the declared default applies; a model id missing from the catalog still works, because the catalog is display-only.

**Registration.** One route cannot hold two adapters; `replace()` swaps routes atomically, so no request falls through a gap mid-swap; and replacing after disposal throws `REGISTRATION_DISPOSED`.

**The interception layer.** A blocked word returns the refusal text with the adapter never called; a clean message goes to the model as usual; background calls are exempt; a blocked word appearing only inside a tool result does not trip the guard; and the refusal stream itself passes the package invariant.

## Known limitations

- This example parses no provider protocol, so HTTP request mapping, `attributionHeaders()`, SSE parsing, and retry classification are out of scope. To practise that layer, point the script at the OpenAI-compatible failure server in `packages/test-support/llm-mock-server`.
- The guard only inspects what a person said, and the original text still lands in the session history. If compliance requires the text itself not to persist, use `agent/pre-step` with `{ kind: 'reject' }` instead, and confirm for yourself whether the inbox claim event still carries it.
- The word list is substring matching, so it over-triggers: "permission management" is blocked too. The list travels through `Config`, so a patch can change it (see `cordis.patch.yml`); a regex or a whitelist is the next step if you need precision.
- `listModels()` is display-only. Whether it reaches the browser selector is verified on the host side (the spec calls the same `buildModelCatalog` the web UI uses), but no automated browser click-through covers it.
- The scripted model does no real inference, and `usage` is derived from message count and character count. Do not use it for measurement experiments.

## Distribution

This example ships as a teaching example: no `package.json`, no bundle channel. The full path to an installable package (a `package.json` declaring `dsh.bundle.patch`, its own `cordis.patch.yml`, a prebuilt `lib/`) is in [docs/plugin-package.md](../../docs/plugin-package.md), with [grill-send-button](../grill-send-button/) and [reply-tips](../reply-tips/) as two working templates.
