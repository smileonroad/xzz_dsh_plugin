# xzz-dsh-plugin — DeepSeek Harness plugin development

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

English | [中文](README.zh.md)

This repository is a **learning and practice log** for developing plugins for
**DeepSeek Harness (dsh)**. It is both a **personal notebook** (pitfalls,
insights, experiments) and a **structured knowledge base** (summaries of the
official docs + an index into the corresponding source + complete examples).

## How to verify

The `examples/` directory is the **source of truth** for plugin code (it does
not run standalone in this repo). To run tests or load a plugin, **copy the
`examples/<project>/` directory into the deepseek-harness source's
`examples/<project>/`**, then operate from the deepseek-harness root. The
exact steps per example (copy, test, web mount commands) are in each
directory's README, e.g. [examples/helloworld-command/](examples/helloworld-command/).

## Directory layout

```
xzz-dsh-plugin/
├── README.md                     # this file: purpose + quick navigation + layout conventions
├── docs/                         # [own] study summaries (distilled from the official docs); index and
│                                 #   summary↔upstream hash pairing live in docs/README.md
├── reference/                    # [upstream] copies of official materials (read-only; copyright upstream)
├── notes/                        # experience essays series (published articles, by date/topic)
└── examples/                     # hands-on project source (one subdirectory per project; source of
    │                             #   truth — copy into the deepseek-harness source to run)
    ├── helloworld-command/       # practice #1: /helloworld command plugin (source + tests)
    ├── sql-check-tool/           # practice #2: sql_check tool plugin (source + tests)
    ├── csv-query-tool/           # practice #3: csv_query tool plugin (config + bundle)
    ├── units-capability/         # practice #4: ctx.units service seam (Definition/Provider/Consumer)
    └── events-demo/              # practice #5: typed events on real harness events (tools waterfall + commands/change)
```

**Master index: [docs/README.md](docs/README.md)** (summary catalog +
summary↔upstream hash pairing + practice projects + development workflow
cheatsheet + key deepseek-harness sources).

## Quick navigation

- Start from scratch: read [docs/cordis-basics.md](docs/cordis-basics.md) for
  the plugin model, then [docs/plugin-package.md](docs/plugin-package.md) for
  the package layout.
- First practice project: `examples/helloworld-command/` (the `/helloworld`
  command plugin, with source and tests). Second: `examples/sql-check-tool/`
  (the `sql_check` tool plugin). Third: `examples/csv-query-tool/` (the
  `csv_query` tool plugin, with plugin config and an installable bundle).
  Fourth: `examples/units-capability/` (the `unit_convert` tool behind a
  `ctx.units` service seam split into Definition/Provider/Consumer).
  Fifth: `examples/events-demo/` (typed events on real harness events — the
  `tools/*` waterfall interception points and `commands/change`).
- Experience essays: see [Published notes](#published-notes) below.
- Official first-hand tutorial: [reference/cordis-tutorial/](reference/cordis-tutorial/).

## Published notes

Experience essays, one per practice project, written in Chinese. Each pairs
with its source package under `examples/` (see the practice table in
[docs/README.md](docs/README.md)).

| Date | Topic | Note |
| ---- | ----- | ---- |
| 2026-08-15 | `/helloworld` command plugin: commands vs tools, three pitfalls, test philosophy | [2026-08-15-helloworld-command.md](notes/2026-08-15-helloworld-command.md) |
| 2026-08-16 | `sql_check` tool plugin: defineTool contract, canonical values, pure presenters, zero-dependency node:sqlite | [2026-08-16-sql-check-tool.md](notes/2026-08-16-sql-check-tool.md) |
| 2026-08-18 | `csv_query` tool plugin: Config schema, config/argument layering, hand-written CSV parser, bundle distribution | [2026-08-16-csv-query-tool.md](notes/2026-08-16-csv-query-tool.md) |
| 2026-08-22 | `ctx.units` service seam: Definition/Provider/Consumer roles, flat service-key namespace, inject-driven loading, config-swapped tables | [2026-08-22-units-capability.md](notes/2026-08-22-units-capability.md) |
| 2026-08-22 | typed events on real harness events: tools/* waterfall observer/decider discipline, five distribution modes (serial/bail/parallel via fixtures) | [2026-08-22-events-demo.md](notes/2026-08-22-events-demo.md) |

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

More background: [docs/cordis-basics.md](docs/cordis-basics.md) and the
official [reference/architecture.zh.md](reference/architecture.zh.md)
(archived into this repo).

## License

**The whole project (code, notes, docs) is MIT-licensed.** See
[LICENSE](LICENSE).

- The root `LICENSE` covers the whole repository.
- The standalone source package `examples/helloworld-command/` ships its own
  `LICENSE` (MIT) and can be downloaded and distributed independently.
- The referenced dsh official docs/source follow their upstream license (the
  dsh repo is MIT); the pairing is recorded in `docs/README.md`.
