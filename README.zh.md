# xzz-dsh-plugin — DeepSeek Harness 学习与练习

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](README.md) | 中文

本仓库是 **DeepSeek Harness (dsh)** 的学习与实践记录，按「先懂、再用、再写」排成三段。

| 段 | 练什么 |
| --- | --- |
| [01-learn-basics](01-learn-basics/) · DSH 基础学习 | dsh 与 Cordis 的概念、官方一手教材 |
| [02-practice-app](02-practice-app/) · DSH 应用练习 | 不写插件，把 dsh 本身当应用跑起来（headless / acp / jsonrpc / web / schedule） |
| [03-practice-plugin](03-practice-plugin/) · DSH 插件练习 | 自己写插件，11 个实战加配套笔记 |

## 验证方式

`03-practice-plugin/examples/` 是插件源码的**权威来源**（在本仓库内不独立运行）。要跑测试或加载插件，把对应的 `examples/<项目>/` **拷贝到 deepseek-harness 源码的 `examples/<项目>/`**（覆盖；那边的副本可能过期），再在 deepseek-harness 根目录操作。每个例子的具体命令（拷贝、测试、web 挂载）见对应目录的 README，如 [examples/helloworld-command/](03-practice-plugin/examples/helloworld-command/)。

## 目录结构

```
xzz-dsh-plugin/
├── README.md / README.zh.md / README.i18n.yaml    # 本文件（双语）与 hash 记录
├── 01-learn-basics/          # DSH 基础学习
│   ├── README.md             # 段索引
│   ├── notes/                # 自写学习摘要
│   ├── sources/              # 官方一手材料副本（只读，版权归上游）
│   └── examples/             # 基础概念的最小可运行示例
├── 02-practice-app/          # DSH 应用练习
│   ├── README.md
│   ├── notes/                # 应用形态笔记（surface 系列）
│   ├── sources/
│   └── scripts/              # 零依赖运行器与 cordis 配置
├── 03-practice-plugin/       # DSH 插件练习
│   ├── README.md
│   ├── notes/                # 经验文章（对外发布）
│   ├── sources/              # 官方插件开发手册副本（只读）
│   └── examples/             # 11 个实战源码（权威来源）
└── meta/                     # 元信息，不属于任何一段
    ├── index.md              # 整体索引 + 摘要↔上游 hash 配对
    ├── notes-writing-style.md / readme-writing-style.md
    └── proposals/            # 开发提案
```

三段内部用同一套词汇。**`notes/` 是自己写的，`sources/` 是别人写的，`examples/`（或 `scripts/`）是能跑的。**

**整体索引：[meta/index.md](meta/index.md)**（各篇摘要 + 摘要↔上游 hash 配对 + 开发流程速记 + deepseek-harness 关键源码）。

## 经验文章

插件练习段一个实战对应一篇，每篇与其 `03-practice-plugin/examples/` 下的源码包配对（实战表见 [meta/index.md](meta/index.md)）。应用练习段另有一套「surface 系列」讲 dsh 的接入形态，索引见 [02-practice-app/README.md](02-practice-app/README.md)。

| 日期 | 主题 | 笔记 |
| ---- | ---- | ---- |
| 2026-08-15 | `/helloworld` 命令插件实战：命令 vs 工具、三个坑、测试哲学 | [2026-08-15-helloworld-command.md](03-practice-plugin/notes/2026-08-15-helloworld-command.md) |
| 2026-08-16 | `sql_check` 工具插件实战：defineTool 契约、canonical value、presenters 纯函数、零依赖 node:sqlite | [2026-08-16-sql-check-tool.md](03-practice-plugin/notes/2026-08-16-sql-check-tool.md) |
| 2026-08-16 | `csv_query` 工具插件实战：Config schema、参数覆盖配置分层、手写 CSV 解析器、bundle 打包分发 | [2026-08-16-csv-query-tool.md](03-practice-plugin/notes/2026-08-16-csv-query-tool.md) |
| 2026-08-22 | `ctx.units` seam 实战：Definition/Provider/Consumer 三角色、服务键命名空间、inject 依赖驱动、config 换表 | [2026-08-22-units-capability.md](03-practice-plugin/notes/2026-08-22-units-capability.md) |
| 2026-08-23 | 事件实战：监听真实 harness 事件（tools 瀑布 + commands/change）、waterfall 观察者/决策者纪律、五种分发模式 | [2026-08-23-events-demo.md](03-practice-plugin/notes/2026-08-23-events-demo.md) |
| 2026-08-24 | 自声明事件实战：奶茶店事件族（declare module + @mode 契约）、五种分发模式全自有声明（serial/bail/parallel 真实语义）、type-only import、事件派生 | [2026-08-24-tea-shop-demo.md](03-practice-plugin/notes/2026-08-24-tea-shop-demo.md) |
| 2026-08-26 | approval 应答者实战：传达室自动审批（allow/deny 名单 + prepend 层序）、approval/request 三角色与 fail-closed、审计对与会话策略 | [2026-08-26-gatehouse-demo.md](03-practice-plugin/notes/2026-08-26-gatehouse-demo.md) |
| 2026-09-02 | Client 对话节点实战：洗衣店卡片（可重放 session 事件 + Conversation Node Definition + keyed 聊天渲染器，纯投影测试） | [2026-09-02-laundry-demo.md](03-practice-plugin/notes/2026-09-02-laundry-demo.md) |
| 2026-09-07 | 输入栏一键发送按钮：聊天输入框旁加一个可点按钮，点一下就把预设的一句话发出去（练习在输入框工具行加控件、走官方发送通道、消息在飞时自动禁用；09-09 补记：提升为可安装标准包，经官方命令装进 profile） | [2026-09-07-grill-send-button.md](03-practice-plugin/notes/2026-09-07-grill-send-button.md) |
| 2026-09-09 | 回答完自动给建议：发送键旁加一个推荐开关，打开后每次回答结束，输入框上方自动给出一排可点的问题建议，点一下就发出去（练习界面与服务端两头协作，界面只负责显示，服务端负责记住开关和照着最新问答生成建议） | [2026-09-09-reply-tips.md](03-practice-plugin/notes/2026-09-09-reply-tips.md) |
| 2026-09-17 | 模型提供方实战：离线模型适配器（自定义 LlmAdapter 实现 stream、规范分片流由包不变量强制、抛错被规范化成终态 finish、reasoning 能力在 stream 之前校验、注册与原子 replace）+ 敏感词拦截层（`llm/stream` 瀑布短路，不调模型也能回答） | [2026-09-17-scripted-llm-adapter.md](03-practice-plugin/notes/2026-09-17-scripted-llm-adapter.md) |

## 什么是 DeepSeek Harness（dsh）

> dsh 是一个开源的 agent harness（智能体框架）。它基于 **Cordis** 插件框架构建：一切皆插件——模型适配器、工具注册表、会话日志、agent loop 本身都只是插件。

- 插件是挂载到共享 `context`（`ctx`）上的对象：通过 `ctx.<serviceKey>` 使用服务、通过 `ctx.on(...)` 监听事件、通过 `ctx.effect()` 管理生命周期。
- 插件组合由 `cordis.yml`（配置树）描述；`dsh` 启动时按 profile 组装 bundle 层。
- 模型能调用的是**工具**（tool）；人类在 UI 里敲的是**命令**（command）。二者是两回事。

更多背景见 [01-learn-basics/notes/cordis-basics.md](01-learn-basics/notes/cordis-basics.md) 与官方 [01-learn-basics/sources/architecture.zh.md](01-learn-basics/sources/architecture.zh.md)（已归档到本仓库）。

## 许可

**整个项目（代码、笔记、文档）遵循 MIT 协议**。详见 [LICENSE](LICENSE)。

- 项目根 `LICENSE` 覆盖全仓库。
- 独立源码包 `03-practice-plugin/examples/helloworld-command/` 自带 `LICENSE`（MIT），可独立下载、独立分发。
- 引用的 dsh 官方文档/源码遵循其上游许可（dsh 仓库为 MIT），本仓库已在 `meta/index.md` 中标注对应关系。
