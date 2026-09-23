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
    ├── upstream-pairing.md   # 摘要↔上游 hash 配对
    ├── notes-writing-style.md / readme-writing-style.md
    └── proposals/            # 开发提案
```

三段内部用同一套词汇。**`notes/` 是自己写的，`sources/` 是别人写的，`examples/`（或 `scripts/`）是能跑的。**

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
- 引用的 dsh 官方文档/源码遵循其上游许可（dsh 仓库为 MIT），本仓库已在 `meta/upstream-pairing.md` 中标注对应关系。
