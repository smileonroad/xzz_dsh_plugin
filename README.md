# xzz-dsh-plugin — DeepSeek Harness learning and practice

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

English | [中文](README.zh.md)

This repository is a **learning and practice log** for **DeepSeek Harness
(dsh)**, arranged into three stages: understand it first, then run it, then
write plugins for it.

| Stage | What it practises |
| --- | --- |
| [01-learn-basics](01-learn-basics/) · dsh basics | dsh and Cordis concepts, plus the official first-hand material |
| [02-practice-app](02-practice-app/) · dsh as an app | not writing plugins, but driving dsh itself (headless / acp / jsonrpc / web / schedule) |
| [03-practice-plugin](03-practice-plugin/) · writing plugins | writing plugins: 11 hands-on projects with their essays |

## How to verify

`03-practice-plugin/examples/` is the **source of truth** for plugin code (it
does not run standalone in this repo). To run tests or load a plugin, **copy
the `examples/<project>/` directory into the deepseek-harness source's
`examples/<project>/`** (overwrite; the copy over there may be stale), then
operate from the deepseek-harness root. The exact commands per example (copy,
test, web mount) are in each directory's README, e.g.
[examples/helloworld-command/](03-practice-plugin/examples/helloworld-command/).

## Directory layout

```
xzz-dsh-plugin/
├── README.md / README.zh.md / README.i18n.yaml   # this file (bilingual) and its hash record
├── 01-learn-basics/          # dsh basics
│   ├── README.md             # stage index
│   ├── notes/                # own study summaries
│   ├── sources/              # copies of official first-hand material (read-only; copyright upstream)
│   └── examples/             # smallest runnable examples for the basic concepts
├── 02-practice-app/          # dsh as an app
│   ├── README.md
│   ├── notes/                # access-surface essays (the surface series)
│   ├── sources/
│   └── scripts/              # zero-dependency runners and cordis configs
├── 03-practice-plugin/       # writing plugins
│   ├── README.md
│   ├── notes/                # experience essays (published articles)
│   ├── sources/              # copies of the official plugin-authoring manuals (read-only)
│   └── examples/             # 11 hands-on projects (source of truth)
└── meta/                     # repository metadata, belonging to no stage
    ├── index.md              # master index + summary↔upstream hash pairing
    ├── notes-writing-style.md / readme-writing-style.md
    └── proposals/            # development proposals
```

All three stages share one vocabulary. **`notes/` is what I wrote,
`sources/` is what someone else wrote, and `examples/` (or `scripts/`) is what
runs.**

**Master index: [meta/index.md](meta/index.md)** (summary catalog,
summary↔upstream hash pairing, development workflow cheatsheet, key
deepseek-harness sources).

## Published notes

One essay per plugin project, written in Chinese, each paired with its source
package under `03-practice-plugin/examples/` (see the practice table in
[meta/index.md](meta/index.md)). The app stage has its own "surface series"
walking the dsh access surfaces, indexed at
[02-practice-app/README.md](02-practice-app/README.md).

| Date | Topic | Note |
| ---- | ----- | ---- |
| 2026-08-15 | `/helloworld` command plugin: commands vs tools, three pitfalls, test philosophy | [2026-08-15-helloworld-command.md](03-practice-plugin/notes/2026-08-15-helloworld-command.md) |
| 2026-08-16 | `sql_check` tool plugin: defineTool contract, canonical values, pure presenters, zero-dependency node:sqlite | [2026-08-16-sql-check-tool.md](03-practice-plugin/notes/2026-08-16-sql-check-tool.md) |
| 2026-08-16 | `csv_query` tool plugin: Config schema, config/argument layering, hand-written CSV parser, bundle distribution | [2026-08-16-csv-query-tool.md](03-practice-plugin/notes/2026-08-16-csv-query-tool.md) |
| 2026-08-22 | `ctx.units` capability seam: Definition/Provider/Consumer roles, flat service-key namespace, inject-driven loading, config-swapped tables | [2026-08-22-units-capability.md](03-practice-plugin/notes/2026-08-22-units-capability.md) |
| 2026-08-23 | typed events on real harness events: tools/* waterfall observer/decider discipline, five distribution modes (serial/bail/parallel via fixtures) | [2026-08-23-events-demo.md](03-practice-plugin/notes/2026-08-23-events-demo.md) |
| 2026-08-24 | self-declared events: milk-tea shop event family (declare module + @mode contract), all five modes with real semantics, type-only import, event derivation | [2026-08-24-tea-shop-demo.md](03-practice-plugin/notes/2026-08-24-tea-shop-demo.md) |
| 2026-08-26 | approval answerer: gatehouse auto-approval (allow/deny lists + prepend layer order), the approval/request roles and fail-closed outcomes, audit pair and session policy | [2026-08-26-gatehouse-demo.md](03-practice-plugin/notes/2026-08-26-gatehouse-demo.md) |
| 2026-09-02 | Client conversation node: laundromat card (durable session events + Conversation Node Definition + keyed chat renderer, pure-projection tests) | [2026-09-02-laundry-demo.md](03-practice-plugin/notes/2026-09-02-laundry-demo.md) |
| 2026-09-07 | one-click send button: a clickable button beside the chat input that sends a preset phrase (adding a control to the composer tool row, sending through the official path, auto-disabled while a message is in flight; a 2026-09-09 follow-up promotes it into an installable standard package and installs it into a profile through the official install command) | [2026-09-07-grill-send-button.md](03-practice-plugin/notes/2026-09-07-grill-send-button.md) |
| 2026-09-09 | auto suggestions after each answer: a Recommend toggle beside the send button; when on, a row of clickable follow-up questions appears above the input after every answer, and clicking one sends it (the UI only displays while the server remembers the toggle and generates suggestions from the latest question and answer) | [2026-09-09-reply-tips.md](03-practice-plugin/notes/2026-09-09-reply-tips.md) |
| 2026-09-17 | model provider: an offline model adapter (a custom LlmAdapter implements stream; the canonical chunk stream is enforced by package invariants; thrown errors normalize into a terminal finish; the reasoning capability is checked before stream; registration swaps atomically) plus a sensitive-word guard layer (short-circuits the `llm/stream` waterfall, answering without calling the model) | [2026-09-17-scripted-llm-adapter.md](03-practice-plugin/notes/2026-09-17-scripted-llm-adapter.md) |

## What is DeepSeek Harness (dsh)

> dsh is an open-source agent harness. It is built on the **Cordis** plugin
> framework: everything is a plugin — model adapters, the tool registry, the
> session log, the agent loop itself are all plugins.

- A plugin is an object mounted on the shared `context` (`ctx`): it consumes
  services via `ctx.<serviceKey>`, listens to events via `ctx.on(...)`, and
  manages its lifecycle via `ctx.effect()`.
- Plugin composition is described by `cordis.yml` (a config tree); `dsh`
  assembles bundle layers per profile at startup.
- What the **model** can call are **tools**; what a **human** types in the UI
  are **commands**. The two are different things.

More background: [01-learn-basics/notes/cordis-basics.md](01-learn-basics/notes/cordis-basics.md)
and the official
[01-learn-basics/sources/architecture.zh.md](01-learn-basics/sources/architecture.zh.md)
(archived into this repo).

## License

**The whole project (code, notes, docs) is MIT-licensed.** See
[LICENSE](LICENSE).

- The root `LICENSE` covers the whole repository.
- The standalone source package `03-practice-plugin/examples/helloworld-command/`
  ships its own `LICENSE` (MIT) and can be downloaded and distributed
  independently.
- The referenced dsh official docs/source follow their upstream license (the
  dsh repo is MIT); the pairing is recorded in `meta/index.md`.
