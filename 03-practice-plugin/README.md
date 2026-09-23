# 03-practice-plugin · DSH 插件练习

这一段练**自己写插件**。每篇实战都是「一个可运行源码目录 + 一篇经验笔记」，源码是权威来源，可独立阅读、可作参考模板。

## 实战序列

按「插进内核的哪一层」排，从最外的人机界面往里走。

| # | 插在哪一层 | 服务键 / 机制 | 实战 | 笔记 | 源码 |
| --- | --- | --- | --- | --- | --- |
| ① | 人敲的斜杠命令 | `ctx.commands` | helloworld-command | [笔记](notes/2026-08-15-helloworld-command.md) | [源码](examples/helloworld-command/) |
| ② | 模型能调用的工具 | `ctx.tools` | sql-check-tool | [笔记](notes/2026-08-16-sql-check-tool.md) | [源码](examples/sql-check-tool/) |
| ③ | 工具 + 配置分层 + 分发 | `ctx.tools` + Config | csv-query-tool | [笔记](notes/2026-08-16-csv-query-tool.md) | [源码](examples/csv-query-tool/) |
| ④ | 插件之间的能力 seam | `ctx.units` | units-capability | [笔记](notes/2026-08-22-units-capability.md) | [源码](examples/units-capability/) |
| ⑤ | 插件之间的事件（监听真实事件） | `ctx.on` / `ctx.emit` | events-demo | [笔记](notes/2026-08-23-events-demo.md) | [源码](examples/events-demo/) |
| ⑥ | 自声明事件族 | `declare module` + `@mode` | tea-shop-demo | [笔记](notes/2026-08-24-tea-shop-demo.md) | [源码](examples/tea-shop-demo/) |
| ⑦ | 审批应答 | `approval/request` | gatehouse-demo | [笔记](notes/2026-08-26-gatehouse-demo.md) | [源码](examples/gatehouse-demo/) |
| ⑧ | 界面（Client 对话节点） | `ctx.slots` + session 投影 | laundry-demo | [笔记](notes/2026-09-02-laundry-demo.md) | [源码](examples/laundry-demo/) |
| ⑨ | 界面（纯 Client 输入栏） | `slots.inject` + `inputActions` | grill-send-button | [笔记](notes/2026-09-07-grill-send-button.md) | [源码](examples/grill-send-button/) |
| ⑩ | Client + Host 双端联动 | `host.call` ↔ `harness.handle` | reply-tips | [笔记](notes/2026-09-09-reply-tips.md) | [源码](examples/reply-tips/) |
| ⑪ | 模型提供方 | LLM 适配器 + `llm/stream` | scripted-llm-adapter | [笔记](notes/2026-09-17-scripted-llm-adapter.md) | [源码](examples/scripted-llm-adapter/) |

## 插件开发摘要（读官方手册的提炼）

| 摘要 | 讲什么 | 上游原文 |
| --- | --- | --- |
| [adding-a-tool.md](notes/adding-a-tool.md) | 添加模型工具：工具 vs 命令、执行扩展点 | [sources/cookbook/adding-a-tool.zh.md](sources/cookbook/adding-a-tool.zh.md) |
| [plugin-config.md](notes/plugin-config.md) | 插件配置：Schemastery、同名导出、分层 | [sources/basic/config.md](sources/basic/config.md) |
| [plugin-package.md](notes/plugin-package.md) | 插件包布局、独立分发包与官方安装通道 | [sources/cookbook/adding-a-package.zh.md](sources/cookbook/adding-a-package.zh.md) |
| [client-plugin.md](notes/client-plugin.md) | Client 插件（Web UI 侧） | [sources/cookbook/adding-a-conversation-node.zh.md](sources/cookbook/adding-a-conversation-node.zh.md) |

## 目录

| 目录 | 装什么 |
| --- | --- |
| `examples/` | 11 个实战源码，**权威来源**（拷贝到 deepseek-harness 的 `examples/` 下运行） |
| `notes/` | 经验文章（对外发布）+ 上面四篇开发摘要 |
| `sources/` | 官方插件开发手册副本（只读）：`basic/`、`cookbook/` |

## 怎么跑

源码在本仓库内不独立运行。测试与加载都在 deepseek-harness 根目录做，验证前**先把这个目录拷过去**。

```sh
cp -r xzz-dsh-plugin/03-practice-plugin/examples/<项目> deepseek-harness/examples/<项目>   # 覆盖同步
pnpm exec vitest run --config examples/<项目>/vitest.examples.config.ts examples/<项目>     # 在 harness 根目录跑
```

每个实战目录的 README 里写了它自己的拷贝、测试、web 挂载命令。

## 和另外两段的关系

- 概念没打底的，先看 [01-learn-basics](../01-learn-basics/)。
- 只想把 dsh 用起来、不打算写插件，看 [02-practice-app](../02-practice-app/)。

摘要↔上游 hash 配对见 [meta/upstream-pairing.md](../meta/upstream-pairing.md)；开发流程速记与关键源码位置见 [CLAUDE.md](../CLAUDE.md)。
