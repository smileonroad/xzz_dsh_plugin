# surface 汇总：同一个内核的五种打开方式

> 相关代码：逐篇深入见 [README](README.md) 的链接；demo 运行器都在 [demo/](../../demo/) 下

前面五篇把五种 surface 各讲了一遍：headless 是一次性任务，acp 是宿主驱动的长会话，jsonrpc 是程序员的极简协议，web 是唯一带脸的，schedule 是 agent 自己记的未来。这篇把它们摆在一起比一比——**它们不是五个程序，是同一个插件化内核的五种打开方式**。内核只有一个，门开了五个。

## 共同点：共享的底座

先说一样的。任何 surface 能跑起来，靠的都是同一套东西：

- **同一个 agent 循环**。跑通 headless = 内核基本可用，其余 surface 全是它的会话化变体，只是换接入方式。
- **同一套凭证与网关机制**。key 走根 `.env` 的 `DEEPSEEK_API_KEY`；网关 `DEEPSEEK_BASE_URL` 是 bootstrap-only，只能由启动环境提供（app-boot 拒收 `.env` 里声明它），所以每个 demo 运行器都用 `env: { ...process.env, DEEPSEEK_BASE_URL }` 显式传入。
- **同一套配置驱动**。行为由 `cordis.yml` + `--patch` overlay 决定，换模型/换工具改配置不改代码（jsonrpc 是例外，模型走协议参数）。
- **同一个会话日志**。状态落盘、可重放；schedule 的提醒状态就存在这份日志里，timer 是它的投影。

## 差异对比：一张表看五个

| 维度 | headless | acp | jsonrpc | web | schedule |
|---|---|---|---|---|---|
| 本质 | 一次性任务 CLI | ACP 协议服务器 | JSON-RPC 服务器 | 浏览器 GUI | 定时提醒能力 |
| 会话 | 无，跑完即退 | `session/new` 显式建 | 惰性创建，id 自选 | 长驻会话 | 挂在 live agent 上 |
| 界面 | 终端 | 无（stdin/stdout 协议） | 无（行帧协议） | 浏览器 | 无（工具 + 日志） |
| 谁驱动 | 用户/脚本 | 宿主程序 | 客户端程序 | 人工 | 定时器/内核唤醒 |
| 完成信号 | 退出码 | `stopReason` | 事件流自判（turn/end） | 人看 | turn/end |
| 换模型 | `--patch` 覆盖 | 改 `cordis.yml` | 协议参数 | `--patch` 覆盖 | — |
| 无人值守 | ✅ | ✅ | ✅ | ❌ 人工在回环 | ✅ |

## 差异详解：三个最容易混的点

**会话是最大的分水岭。** headless 没会话（跑一条命令就散伙），acp 用 `session/new` 显式建会话（`sessionId` 贯穿多轮），jsonrpc 最懒——session 按 id 惰性创建，未知 id 自动建。web 是长驻的，浏览器里的对话天然连续。

**完成判定各说各话。** headless 看退出码；acp 有 `stopReason`（模型说"我说完了"）；jsonrpc 没有 per-prompt 结果，客户端要从事件流里找 `turn/end` 自己判；web 是人在看，没有"完成信号"这回事；schedule 交付后等一个 follow-up turn 结束。

**模型路由三套做法。** headless/web 用 `--patch` 覆盖 `agent-default-model`；acp 改 `cordis.yml` 的 `model` 字段；jsonrpc 最特别，模型直接是 `initialize` 的协议参数，换模型改一行客户端代码。这一点把"极简、程序化"的定位体现得最明显。

## 权限：唯一一个人工在回环的

headless/acp/jsonrpc 都能 `DSH_PERMISSION_MODE=danger-full-access` 全放行、无人值守。**web 是唯一"人在回环"的**——危险操作弹框，人点头工具才执行。所以选 surface 时先问一句：这个场景能无人值守吗？不能，就上 web。

## 应用：什么时候用哪个

- **headless**：脚本/CI 里跑一次性任务，或快速验证配置和模型连通性——跑通 headless = 内核基本可用。
- **acp**：把 DSH 当后台引擎集成进编辑器/IDE，宿主程序驱动的多轮长会话，协议级权限协商。
- **jsonrpc**：程序化接入 agent，客户端自己订阅事件流、自己组装、自己判定完成；换模型频繁的场景（模型在协议层）。
- **web**：人机对话、配置/工具可视化、需要人工审批权限的场景；也是 web-cordis 自指示例（agent 修改自己运行时）的演示载体。
- **schedule**：给 live agent 装闹钟——定时/周期提醒、状态进 session 日志可重放。它不独占一个 surface，挂在任意 live agent 上（demo 里用 web overlay 或独立 jsonrpc 验证）。

## 特点

- **同一内核五种门**：跑的是同一个插件化 agent，打开方式决定了谁能用、怎么用。
- **会话化程度分三档**：无（headless）→ 显式/惰性（acp/jsonrpc）→ 长驻（web）。
- **完成信号随接入方式走**：退出码、`stopReason`、事件流自判、人看。
- **人工在回环只有 web**：其余 surface 都能无人值守。
- **模型路由是定位的镜子**：headless/web 改配置、acp 改字段、jsonrpc 改参数——越程序化，越往协议层走。
- **schedule 是横切能力**：不属于"怎么接进去"，而是 agent 怎么记住未来，挂在 live agent 上。
