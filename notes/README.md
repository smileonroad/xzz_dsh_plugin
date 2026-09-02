# surface 系列：同一个内核的五种打开方式

学习 DeepSeek Harness 接入形态与横切能力的笔记系列。每篇一个主题，demo 运行器都在仓库根 [demo/](../demo/) 下，全部实测跑通。

## 系列

| # | 篇 | 主题 | 笔记 | demo 运行器 |
|---|---|---|---|---|
| 01 | headless | 一次性任务 CLI | [2026-08-21-headless-cli.md](2026-08-21-headless-cli.md) | run-headless.mjs |
| 02 | acp | 宿主驱动的长会话 | [2026-08-21-acp.md](2026-08-21-acp.md) | acp-mini-client.mjs |
| 03 | jsonrpc | SDK 极简协议 | [2026-09-02-jsonrpc-sdk-protocol.md](2026-09-02-jsonrpc-sdk-protocol.md) | jsonrpc-mini-client.mjs |
| 04 | web | 浏览器 GUI | [2026-09-02-web-gui.md](2026-09-02-web-gui.md) | run-web.mjs |
| 05 | schedule | 定时提醒能力 | [2026-09-02-schedule.md](2026-09-02-schedule.md) | run-schedule.mjs |
| 06 | 汇总 | 同一个内核的五种打开方式 | [2026-09-02-surface-summary.md](2026-09-02-surface-summary.md) | — |

## 运行前提

- 相邻目录有 deepseek-harness 源码 checkout（demo 脚本自动定位其 CLI/服务 bin；或用 `DSH_BIN` / `ACP_BIN` / `JSONRPC_BIN` 环境变量覆盖）。
- `DEEPSEEK_BASE_URL`：bootstrap-only，只能由启动环境提供（app-boot 拒收 `.env` 里声明它）。
- key：deepseek-harness 根 `.env` 的 `DEEPSEEK_API_KEY`，或 `~/.dsh/.credentials.yaml` 全局凭据（demo 脚本在环境缺失时自动借真 key；占位 key 一律禁用——loadEnv 不覆盖已存在的环境变量）。

## 阅读顺序建议

按 01 → 06 顺序读：headless 是地基（跑通它 = 内核可用），02/03 是两种程序化长会话（ACP 规范 vs 极简自组），04 是唯一 GUI + 人工在回环，05 是横切能力（agent 怎么记住未来），06 把五篇摆在一起对比选型。
