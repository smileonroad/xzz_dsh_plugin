# 01-learn-basics · DSH 基础学习

这一段解决一个问题，**dsh 到底是什么**。不写插件，也不跑应用，先把概念和官方教材过一遍，给后面两段打底。

## 从哪读起

1. [sources/architecture.zh.md](sources/architecture.zh.md) — dsh 的整体架构，先建立全局印象。
2. [notes/cordis-basics.md](notes/cordis-basics.md) — Cordis 基础，插件、context、服务、事件、effect 五件事。
3. [sources/cordis-primer.zh.md](sources/cordis-primer.zh.md) — Cordis 官方入门，看一遍原文。
4. [sources/cordis-tutorial/](sources/cordis-tutorial/) — 官方七步教程，从第一个插件写到接进 harness。

## 目录

| 目录 | 装什么 |
| --- | --- |
| `notes/` | 自写学习摘要，目前一篇 `cordis-basics.md` |
| `sources/` | 官方一手材料副本（只读，版权归上游）：`cordis-primer`、`cordis-tutorial/`、`architecture` |
| `examples/` | 基础概念的最小可运行示例，**待补** |

## 和另外两段的关系

三段是同一条路的三步。

- 这一步懂了概念，去 [02-practice-app](../02-practice-app/) 把 dsh 本身跑起来（headless / acp / jsonrpc / web / schedule）。
- 想改 dsh 的行为，去 [03-practice-plugin](../03-practice-plugin/) 自己写插件。

整体索引与摘要↔上游 hash 配对见 [meta/index.md](../meta/index.md)。
