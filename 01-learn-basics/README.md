# 01-learn-basics · DSH 基础学习

这一段解决一个问题，**dsh 到底是什么**。不写插件，也不跑应用，先把概念和官方教材过一遍，给后面两段打底。

## 从哪读起

1. [notes/typescript-basics.md](notes/typescript-basics.md) — TypeScript 与工程化小抄。没写过 TS、或者被 `tsconfig.json` / 包解析绊住的，从这篇开始。
2. [notes/architecture-reading.md](notes/architecture-reading.md) — 架构文档带领阅读。逐段精读 harness 的 `docs/architecture.md`，每段给原文关键句、白话解释、代码佐证和容易踩的坑，附自测题。
3. [sources/architecture.zh.md](sources/architecture.zh.md) — 架构原文（归档的中文版，与带领阅读是同一个修订版；只是中英行数不同，引用中的行号以英文原本为准）。
4. [notes/cordis-basics.md](notes/cordis-basics.md) — Cordis 基础，插件、context、服务、事件、effect 五件事。
5. [sources/cordis-primer.zh.md](sources/cordis-primer.zh.md) — Cordis 官方入门，看一遍原文。
6. [sources/cordis-tutorial/](sources/cordis-tutorial/) — 官方七步教程原文。
7. [notes/cordis-tutorial/](notes/cordis-tutorial/) — Cordis 教程跟学笔记，照着官方教程一章章实跑，每章末尾配实验与自测；实验源码在 [examples/cordis-tutorial/](examples/cordis-tutorial/)。**框架已立，章节和实验逐步补。**

## 目录

| 目录 | 装什么 |
| --- | --- |
| `notes/` | 自写笔记。三篇单篇摘要（`typescript-basics.md` 语言与工程化、`architecture-reading.md` 架构精读、`cordis-basics.md` Cordis 容器），外加一个系列目录 `cordis-tutorial/`（8 章，待补） |
| `sources/` | 官方一手材料副本（只读，版权归上游）：`cordis-primer`、`cordis-tutorial/`、`architecture` |
| `examples/` | 能跑的最小示例。目前 `cordis-tutorial/` 的框架已就位，实验逐个补；跑法见 [examples/README.md](examples/README.md) |

## 和另外两段的关系

三段是同一条路的三步。

- 这一步懂了概念，去 [02-practice-app](../02-practice-app/) 把 dsh 本身跑起来（headless / acp / jsonrpc / web / schedule）。
- 想改 dsh 的行为，去 [03-practice-plugin](../03-practice-plugin/) 自己写插件。

摘要↔上游 hash 配对见 [meta/upstream-pairing.md](../meta/upstream-pairing.md)。
