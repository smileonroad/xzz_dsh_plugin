# xzz-dsh-plugin — DeepSeek Harness 插件开发

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](README.md) | 中文

本仓库是 **DeepSeek Harness (dsh)** 插件开发的学习与实践记录。它既是**个人笔记**（踩坑、心得、实验），也是**结构化资料库**（官方文档摘要 + 对应源码索引 + 完整示例）。

## 验证方式

本仓库的 `examples/` 是插件源码的**权威来源**（在本仓库内不独立运行）。要跑测试或加载插件，把对应的 `examples/<项目>/` **拷贝到 deepseek-harness 源码的 `examples/<项目>/`**（覆盖；那边的副本可能过期），再在 deepseek-harness 根目录操作。每个例子的具体命令（拷贝、测试、web 挂载）见对应目录的 README，如 [examples/helloworld-command/](examples/helloworld-command/)。

## 目录结构

```
xzz-dsh-plugin/
├── README.md                     # 本文件：定位 + 快速导航 + 布局约定
├── docs/                         # 【自写】学习摘要（结合官方文档提炼）；目录与配对见 docs/README.md
├── reference/                    # 【上游】官方材料副本（只读参考，版权归上游）
├── notes/                        # 开发经验总结系列（对外发布文章，按日期/主题）
└── examples/                     # 实战项目源码（每个实战一个子目录；源码权威来源，拷贝到 deepseek-harness 源码运行）
    ├── helloworld-command/       # 实战①：/helloworld 命令插件（源码+测试）
    ├── sql-check-tool/           # 实战②：sql_check 工具插件（源码+测试）
    ├── csv-query-tool/           # 实战③：csv_query 工具插件（配置 + bundle）
    ├── units-capability/         # 实战④：ctx.units seam（Definition/Provider/Consumer）
    ├── events-demo/              # 实战⑤：监听真实 harness 事件（tools 瀑布 + commands/change）
    └── tea-shop-demo/            # 实战⑥：自声明事件（奶茶店事件族，五种分发模式全落地）
```

**整体索引：[docs/README.md](docs/README.md)**（摘要目录 + 摘要↔上游 hash 配对 + 实战 + 开发流程速记 + deepseek-harness 关键源码）。

## 经验文章

对外发布的经验笔记，一个实战对应一篇，每篇与其 `examples/` 下的源码包配对（实战表见 [docs/README.md](docs/README.md)）。

| 日期 | 主题 | 笔记 |
| ---- | ---- | ---- |
| 2026-08-15 | `/helloworld` 命令插件实战：命令 vs 工具、三个坑、测试哲学 | [2026-08-15-helloworld-command.md](notes/2026-08-15-helloworld-command.md) |
| 2026-08-16 | `sql_check` 工具插件实战：defineTool 契约、canonical value、presenters 纯函数、零依赖 node:sqlite | [2026-08-16-sql-check-tool.md](notes/2026-08-16-sql-check-tool.md) |
| 2026-08-18 | `csv_query` 工具插件实战：Config schema、参数覆盖配置分层、手写 CSV 解析器、bundle 打包分发 | [2026-08-16-csv-query-tool.md](notes/2026-08-16-csv-query-tool.md) |
| 2026-08-22 | `ctx.units` seam实战：Definition/Provider/Consumer 三角色、服务键命名空间、inject 依赖驱动、config 换表 | [2026-08-22-units-capability.md](notes/2026-08-22-units-capability.md) |
| 2026-08-23 | 事件实战：监听真实 harness 事件（tools 瀑布 + commands/change）、waterfall 观察者/决策者纪律、五种分发模式 | [2026-08-23-events-demo.md](notes/2026-08-23-events-demo.md) |
| 2026-08-24 | 自声明事件实战：奶茶店事件族（declare module + @mode 契约）、五种分发模式全自有声明（serial/bail/parallel 真实语义）、type-only import、事件派生 | [2026-08-24-tea-shop-demo.md](notes/2026-08-24-tea-shop-demo.md) |

## 什么是 DeepSeek Harness（dsh）

> dsh 是一个开源的 agent harness（智能体框架）。它基于 **Cordis** 插件框架构建：一切皆插件——模型适配器、工具注册表、会话日志、agent loop 本身都只是插件。

- 插件是挂载到共享 `context`（`ctx`）上的对象：通过 `ctx.<serviceKey>` 使用服务、通过 `ctx.on(...)` 监听事件、通过 `ctx.effect()` 管理生命周期。
- 插件组合由 `cordis.yml`（配置树）描述；`dsh` 启动时按 profile 组装 bundle 层。
- 模型能调用的是**工具**（tool）；人类在 UI 里敲的是**命令**（command）。二者是两回事。

更多背景见 [docs/cordis-basics.md](docs/cordis-basics.md) 与官方 [reference/architecture.zh.md](reference/architecture.zh.md)（已归档到本仓库）。

## 许可

**整个项目（代码、笔记、文档）遵循 MIT 协议**。详见 [LICENSE](LICENSE)。

- 项目根 `LICENSE` 覆盖全仓库。
- 独立源码包 `examples/helloworld-command/` 自带 `LICENSE`（MIT），可独立下载、独立分发。
- 引用的 dsh 官方文档/源码遵循其上游许可（dsh 仓库为 MIT），本仓库已在 `docs/README.md` 中标注对应关系。
