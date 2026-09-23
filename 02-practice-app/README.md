# 02-practice-app · DSH 应用练习

这一段不写插件，练的是**把 dsh 本身当应用跑起来**。同一个内核，有五种打开方式，每种对应一套接入形态和一批坑。

## surface 系列：同一个内核的五种打开方式

每篇一个主题，运行器都在 [scripts/](scripts/) 下，全部实测跑通。

| # | 形态 | 主题 | 笔记 | 运行脚本 |
| --- | --- | --- | --- | --- |
| 01 | headless | 一次性任务 CLI | [2026-08-21-headless-cli.md](notes/2026-08-21-headless-cli.md) | `scripts/run-headless.mjs` |
| 02 | acp | 宿主驱动的长会话 | [2026-08-21-acp.md](notes/2026-08-21-acp.md) | `scripts/acp-mini-client.mjs` |
| 03 | jsonrpc | SDK 极简协议 | [2026-09-02-jsonrpc-sdk-protocol.md](notes/2026-09-02-jsonrpc-sdk-protocol.md) | `scripts/jsonrpc-mini-client.mjs` |
| 04 | web | 浏览器 GUI | [2026-09-02-web-gui.md](notes/2026-09-02-web-gui.md) | `scripts/run-web.mjs` |
| 05 | schedule | 定时提醒能力 | [2026-09-02-schedule.md](notes/2026-09-02-schedule.md) | `scripts/run-schedule.mjs` |
| — | 汇总 | 五种方式的横向对比 | [2026-09-02-surface-summary.md](notes/2026-09-02-surface-summary.md) | — |
| — | skill | 官方的 skill 系统长什么样 | [2026-08-22-dsh-skill.md](notes/2026-08-22-dsh-skill.md) | — |

## 目录

| 目录 | 装什么 |
| --- | --- |
| `notes/` | 应用形态笔记，讲每种接入方式怎么用、坑在哪 |
| `scripts/` | 零依赖运行器（`.mjs`）与配套 cordis 配置（`.yml`），都是实测可跑的 |
| `sources/` | 应用侧的一手材料（**待补**） |

## 怎么跑

运行器都在 deepseek-harness 根目录跑，脚本自己会去找 harness 的包。以 headless 为例。

```sh
node 02-practice-app/scripts/run-headless.mjs "<你的任务>"
```

每个脚本头部的注释里都写了用法（`--patch` 透传、端口、模型覆盖等），对应笔记里也逐条讲过。

## 和另外两段的关系

- 概念没打底的，先看 [01-learn-basics](../01-learn-basics/)。
- 想改 dsh 的行为而不只是用，去 [03-practice-plugin](../03-practice-plugin/) 写插件。

三段的入口各自在段 README；其它元信息见 [meta/](../meta/)。
