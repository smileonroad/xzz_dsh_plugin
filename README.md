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
    ├── upstream-pairing.md   # summary↔upstream hash pairing
    ├── notes-writing-style.md / readme-writing-style.md
    └── proposals/            # development proposals
```

All three stages share one vocabulary. **`notes/` is what I wrote,
`sources/` is what someone else wrote, and `examples/` (or `scripts/`) is what
runs.**

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
  dsh repo is MIT); the pairing is recorded in `meta/upstream-pairing.md`.
