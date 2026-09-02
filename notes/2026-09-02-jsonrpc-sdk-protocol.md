# jsonrpc：SDK 的极简 JSON-RPC 协议

> 相关代码：`packages/sdk/`（protocol / client / server）、[demo/jsonrpc-mini-client.mjs](../../demo/jsonrpc-mini-client.mjs)、[demo/jsonrpc.cordis.yml](../../demo/jsonrpc.cordis.yml)

如果 ACP 是「宿主驱动的长会话」，那 jsonrpc 就是「程序员自给自足的极简方案」。整个协议**只有 3 个方法**，session 不用你建、模型不用你配，一切靠事件流。它是我这套 demo 里踩坑最多、也最有意思的一篇。

## 是什么

jsonrpc 是 DSH SDK 的接入方式：一个 **stdio 行帧 JSON-RPC 2.0** 服务器，程序化调用 agent。client 自己 spawn 服务器、自己订阅事件流、自己判定完成。

## 怎么用（运行 demo）

[demo/jsonrpc-mini-client.mjs](../../demo/jsonrpc-mini-client.mjs) 是零依赖的最小客户端：

```bash
node demo/jsonrpc-mini-client.mjs "要问的话" 模型名
```

例如：

```bash
node demo/jsonrpc-mini-client.mjs "你好，用一句话介绍你自己。" deepseek-v4-flash
```

它本地 spawn `packages/examples/jsonrpc-demo/src/bin.ts`（dsh-jsonrpc-agent），配置指向 [demo/jsonrpc.cordis.yml](../../demo/jsonrpc.cordis.yml)（minimal 组合 + `thinking: disabled`）。

## demo 代码说明

**第一步，spawn 服务器。** 服务器是 jsonrpc-demo bin，配置指向本地副本：

```js
const child = spawn(process.execPath, ['--import', 'tsx', BIN, CONFIG], {
  cwd: process.cwd(),
  env: { ...process.env, DEEPSEEK_BASE_URL: '...' },
  stdio: ['pipe', 'pipe', 'inherit'], // stdin/stdout = 协议管道，stderr = 诊断
})
```

**帧 handler 必须先于第一个 await 注册**（见踩坑 4），然后才是协议三步：

```js
const init = await request('initialize', {
  cwd: process.cwd(),
  provider: 'deepseek-official',
  model,                            // ← 模型路由是协议参数：换模型改这一行即可
})
const prompt = await request('session/prompt', {
  sessionId: SESSION_ID,            // id 客户端自选，未知 id 惰性建 session
  contentBlocks: [{ type: 'text', text: task }],
})
const done = await request('shutdown', {})
```

**第三步，自己组装输出。** 没有 per-prompt 结果，一切靠 `session.event` 通知流。客户端要从事件里挑 text-delta 拼正文：

```js
if (method === 'session.event' && params.sessionId === SESSION_ID) {
  const ev = params.event
  if (ev.type === 'assistant/chunk') {
    const c = ev.data.chunk
    if (c.type === 'text-delta') process.stdout.write(c.text)          // 正文
    else if (c.type === 'reasoning-delta') process.stdout.write(`\n[reasoning] ${c.text}`)  // 思考
  } else if (ev.type === 'turn/end') {
    finishTurn(`turn/end (reason=${ev.data.reason.kind})`)   // ← reason 是对象，取 .kind
  }
}
```

## 自定义模型配置（当时改的三处）

连本地网关时，jsonrpc 的 url 和 key 机制与 acp/headless 一致，**模型名称则是三种 surface 里最特别的——走协议参数，不用碰配置文件**：

1. **url（网关地址）**：`DEEPSEEK_BASE_URL` 由启动环境提供（bootstrap-only，不能放 `.env`），[demo/jsonrpc-mini-client.mjs](../../demo/jsonrpc-mini-client.mjs) 从环境变量读取后透传给子进程。换网关改环境变量即可。
2. **key**：根 `.env` 提供 `DEEPSEEK_API_KEY`，由 bin 的 `loadEnv` 加载；环境里没有时脚本从 `~/.dsh/.credentials.yaml` 借真 key（jsonrpc 组合不挂 credentials 服务，与 acp 同款兜底）。
3. **模型名称**：走 `initialize` 的协议参数（`provider` + `model`），client 第二个命令行参数直接传：

   ```bash
   node demo/jsonrpc-mini-client.mjs "要问的话" deepseek-v4-flash
   ```

   对应 client 里的 initialize 调用：

   ```js
   const init = await request('initialize', {
     cwd: process.cwd(),
     provider: 'deepseek-official',
     model,   // ← 模型路由是协议参数：换模型改这一行即可
   })
   ```

   相比 headless（`--patch` 覆盖 `agent-default-model`）和 acp（改 `cordis.yml` 的 `model` 字段），jsonrpc **换模型完全不用改配置树**——这是它「极简、程序化」定位的直接体现。模型 id 仍需网关认识（[demo/jsonrpc.cordis.yml](../../demo/jsonrpc.cordis.yml) 的 `llm-deepseek.models` 列表列出网关认识的 id，原样透传）。

## 协议：只有 3 个方法

| 方法 | 作用 | 关键点 |
|---|---|---|
| `initialize` | 握手 | **模型路由是协议参数**（`provider` + `model`），换模型改 initialize 即可，不用碰 cordis.yml |
| `session/prompt` | 发消息 | 只把消息入队，返回 `messageId`；**没有 per-prompt 结果** |
| `shutdown` | 收尾 | 服务端 dispose 后自行 exit 0 |

关键设计差异（对比 ACP）：

- **没有 `session/new`**。session 按 `sessionId` 惰性创建，id 客户端自选，未知 id 自动建。
- **没有 per-prompt 结果、没有 stopReason**。流式正文、turn 结束、状态全走通知。
- 服务端从不向客户端发请求（dead capability）。

## 事件流通知（客户端必须自己组装）

| 通知 | 载荷 | 用途 |
|---|---|---|
| `session.event` | 完整 session-log envelope | 流式 token 在 `data.chunk`（text-delta / reasoning-delta）、turn/end 等 |
| `session.status` | running / idle | agent 整体状态变迁 |
| `subagent.started` / `subagent.finished` | — | 子代理生命周期 |

`session.event` 的 envelope 结构：`{ type, seq, time, data, ignorable?, sourceEventSeqs?, surfaceOp? }`。

## 执行结果输出

实跑（key 来自 `~/.dsh/.credentials.yaml` 全局凭据）：

```bash
node demo/jsonrpc-mini-client.mjs "你好，用一句话介绍你自己。" deepseek-v4-flash
```

`initialize` 返回服务器信息，`session/prompt` 只有入队回执（没有结果），正文和完成信号全靠 `session.event` 通知流组装：

```
① initialize → 服务器: deepseek-harness-sdk-runtime v0.0.1
   sessionId = demo-0908c2（客户端自选，惰性创建）
② session/prompt → 「你好，用一句话介绍你自己。」（model=deepseek-v4-flash）
   模型回答（从事件流组装）: 你好！我是DeepSeek Harness驱动的AI编程助手，可以帮你解决编码、调试、文件操作等技术问题。
③ 完成信号: turn/end (reason=completed)
④ shutdown → {}
```

`sessionId` / `messageId` 每次运行不同；正文从 `assistant/chunk` 的 `text-delta` 拼出、reasoning 走 `reasoning-delta`（思考过程在输出里以 `[reasoning]` 前缀出现）；结束判据是 `turn/end` 的 `data.reason.kind`。

## 踩过的坑

**1. 超时 + 空输出（最深的坑）。** 首次跑 `jsonrpc-mini-client.mjs`，等了 240 秒，屏幕上什么都没有，以为是协议坏了。写了个调试脚本把所有帧打出来，发现协议完全正常——根因是模型行为：deepseek-v4-flash 会把简单问候**整个放进 reasoning 通道**，正文 `text` 为空。所有 `assistant/chunk` 都是 `reasoning-delta`，没有 `text-delta`。这就是 "Reasoning-ONLY" 现象。

修复：在 `llm-deepseek` 配置里加 `thinking: disabled`（见 [demo/jsonrpc.cordis.yml](../../demo/jsonrpc.cordis.yml)）。但注意：即使 disabled，模型对难题仍会先产生一小段 reasoning——这是网关行为，不是 DSH 问题。

**2. `reason=[object Object]`。** TurnEndReason 是 discriminated object `{ kind: 'completed' }`，不是字符串。客户端要取 `ev.data.reason.kind`，不能直接拼进字符串。

**3. 模型对难题会在思考里纠结很久。** 把问题换成简单的（"你好，用一句话介绍你自己"）后，才听到正经回答。难的开放问题会触发大量 reasoning 噪音。

**4. 帧 handler 必须先于第一个 await 注册。** 最初把 `child.stdout.on('data', ...)` 写在 `await request('initialize')` 之后——初始化响应到达时 stdout 还处于 paused mode，数据堆在内部缓冲；120 秒后 initialize 超时崩溃，handler 从未工作。现象与「服务器没响应」一模一样，但协议本身完全正常。规则：**spawn 之后、任何 await 之前，先挂好 stdout 的帧分发**。

**5. `turn/end (reason=error)` 时正文为空，去 session 日志找原因。** jsonrpc 组合不挂 credentials 服务，环境里没有 key 时 turn 直接失败。错误详情不在 stderr（只有一句 turn failed），在 `.sessions/<workspace>/<sessionId>/session.jsonl.zstd` 的 `turn/end` 事件里：`reason.kind === 'error'` 时 `reason.error.message` 写着真正的原因（如 `no API key for provider route "deepseek-official"`）。解法与 acp 同款：环境 export 真 key，或脚本从全局凭据借。

## 验证方式

- 协议层面：`initialize` 返回 `serverInfo`（name + version），`session/prompt` 返回 `messageId`。
- 事件流：能看到 `session.event`（assistant/chunk、turn/end）和 `session.status idle` 通知。
- 完成判定：`turn/end` 或 `session.status idle` 任一即收尾。
- 对比调试：写 `_dbg-jsonrpc.mjs` 打印所有帧，逐个核对 chunk 类型，定位 reasoning-only 根因。
- **通用排查法**（与 ACP 篇同思路）：事件流驱动协议下，"客户端没输出"的第一排查法就是**把收到的每一帧 JSON 打出来看实际结构**——先确认事件有没有到，再对着实际字段路径取增量，而不是猜字段。

## 使用场景

- **程序化接入 agent**：SDK 客户端（Python/TS）直接驱动。
- 需要**流式**能力且客户端愿意自己组装输出的场景。
- 换模型频繁的场景（模型路由在协议层，无需改配置）。

## 特点

- **极简**：3 个方法，无 session/new，无 per-prompt 结果。
- **惰性 session**：id 客户端自选，未知即自动建。
- **事件流驱动**：一切状态变化走通知，客户端自组装、自判定。
- **模型路由在协议层**：initialize 参数换模型，不用改 cordis.yml。
- **与 ACP 对比**：ACP 有 session/new、有 stopReason、host 驱动；jsonrpc 全懒、全流式、client 驱动。
