# reply-tips 设计文档

> **修订记录（2026-09-09，动态实测 26 版后定稿语义）**。正文是早期设计稿，机制描述有几处已被实测推翻，
> 以本节为准，冲突时正文只当历史参考。
>
> - **触发**：正文写的「客户端每次渲染现算 + 每 5s/1.5s 轮询」已废弃。最终为 **`session.running`
>   true→false 边沿事件驱动**（composer 输入机 phase 只描述你的消息提交，不代表回合结束）+
>   服务端 **稳定性闸门**（同一回复文本连续 2 次观测一致才定稿，杜绝思考/流式中提前触发）。
> - **清空与保留**：回合结束边沿先清空旧胶囊并显示「推荐问题获取中…」（refresh 模式）；服务端 `notOld`
>   标记保证新一批落库前任何路径（poll/busy）都不回旧缓存。poll（800ms 兜底）只在未做刷新时保留旧胶囊。
> - **取数**：会话正文必须用 `sessionQuery.readSession`，`listEvents` 只回无 `data` 的 metadata。
> - **生成**：请求带 `reasoningEffort: 'off'`（JSON-only 任务不思考，根治 max-tokens 预算被 reasoning
>   烧光）；maxTokens 8000；输出多级解析出口统一 `isJunkTip` 过滤裸符号/JSON 残片。
> - **运行体最终版**：见 `dynamic/code.host.js` 与 `dynamic/code.client.js`；26 版迭代完整档案见
>   `tmp-recon/reply-tips-dynamic/FINAL-2026-09-09.md`。以下正文未更新的细节一律以本节与运行体为准。


> 双语 README 讲「怎么用、教什么」；本文件讲**几何、机制与边界**，供想改它或想把它
> 静态化的人看。运行体是动态 Cordis 插件（code.host + code.client 自包含纯 JS），
> 纯函数层在 `src/index.ts`。

## 布局几何

- 开关：`conversation.input.right`，list 槽，`id: 'reply-tips-toggle'`、`order: 10`。
  与 shipped 的 composer 右侧工具（发送按钮前）并列；新 id = 并列新增，不替换。
- 建议行：`conversation.input.dock`，list 槽，`id: 'reply-tips-row'`、`order: 30`。
  dock 是聊天框上方整行的 ambient 区（todo/goal/queue 同排）。行容器
  `margin: 0 auto`，宽度对齐 `--dsh-composer-card-max-width` 再减 dock inset，
  因此与聊天框同宽、水平居中、正落其上方。
- 建议胶囊：一行横向排布，点击即发送；生成失败时显示一行「生成失败（原因）→ 已用
  规则兜底」的提示文案 + fallback 建议。

## 状态与 RPC

- **唯一真源在服务端**。`mem: Map<sessionId, boolean>` 是运行时真相；`fs` 落盘
  `.reply-tips.json`（`{ "<sessionId>": true|false }`）是持久化真相。客户端组件
  只做「读 → 渲染 / 点 → 乐观写」，不缓存持久状态。
- 私有 JSON RPC 三个 method：

  | method | 入参 | 出参 | 说明 |
  | --- | --- | --- | --- |
  | `reply-tips.get` | `{ sessionId }` | `{ enabled }` | 读开关（mem 优先，miss 读文件） |
  | `reply-tips.set` | `{ sessionId, enabled }` | `{ enabled }` | 乐观写 mem + fs 落盘 |
  | `reply-tips.get-suggestions` | `{ sessionId }` | `{ suggestions, diag }` | 现算建议（reply 指纹缓存） |

- 客户端每会话一个小 controller：`ensure()` 首次拉 `get`，`set()` 乐观写并广播，
  `subscribe()` 让两个槽组件共享同一份开关状态（同一 controller 实例）。

## 建议生成链路

1. **触发**：`ReplyTipsRow` 在开关开且会话存在时挂载，**挂载即拉一次** `get-suggestions`，
   随后用插件 ctx 的 `ctx.timer.interval` 每 5s 轮询（动态客户端侧**没有浏览器
   timer 全局**，`setInterval` 会崩——必须 `inject: ['timer']` 并把 disposer 放回 effect
   cleanup）。服务端按 reply 指纹去重，回复没变直接回缓存，轮询开销≈0。
   不监听 `agent/status`。
2. **取数**（服务端，纯函数在 `src/latestTurnPair`）：从会话事件尾回扫——最新一条非空
   `assistant/message` 当 reply；继续向前找它**之前**最近一条真实 user 提问
   （`source.kind === 'user'`）当 question。二者限定先后，保证同轮配对，不串轮。
3. **生成**：当前默认模型（`agentDefaultModel.currentSelection()`）→ `llm.stream`，
   `temperature: 0`、`maxTokens: 1000`；提示词要求只输出 JSON 字符串数组
   （`src/buildSuggestionsPrompt`）。
4. **解析**（`src/parseModelOutput`）：首尾 `[ ]` 截取试 JSON → 去围栏整体试 JSON →
   整体试 JSON → 逐行兜底（`linesFallback`）。
5. **缓存/兜底**：结果带 `reply` 指纹存 `cacheBySession`；回复文本变 → 指纹变 → 必重算。
   失败（无文本 / 无 llm 服务 / 无模型选择 / 流异常 / 截断 / 解析全败）→
   `fallbackTips` 规则模板兜底，`diag.reason` 带回失败原因供 UI 提示。

## 为什么不用 `agent/status` 触发

`agent/status` 是 agent-scoped 事件：scope-filtered dispatch 只派发给绑定到该 agent
scope 的监听者。动态插件 apply 在普通 ctx 上，`ctx.on('agent/status')` 收不到，所以
不依赖 idle 自动触发；改由客户端渲染现算（最新回复文本作依赖）+ reply 指纹去重，
效果等价（回复完成 → 文本变 → 拉一次）且无 scope 陷阱。

## 动态 vs 静态的边界

- 动态插件能做：`ctx.get()` 到已挂服务（`fs` / `llm` / `agents` / `agentDefaultModel` /
  `sessions`）、注册 `harness.handle` RPC、注册客户端槽、用 `React.createElement`
  渲染。本课的「开关持久 + 回推 UI」用 fs JSON 文件 + llm.stream 演示同一条思路。
- 动态插件做不了（静态包三件套的理由）：
  - **session-log 自定义事件**：`session.append` 携带自定义事件需要静态
    `declare module` 类型合并与事件族注册，动态代码没有。
  - **`@Remote` 生成面**：typert 生成的远程 namespace 需要构建期类型合并。
  - **projection 单元**：持久 projection 需要静态注册与回放单元。
- 因此产品化（真实 Grill Me）把同样的状态/回推做成静态包；动态版是「先验证想法」的
  快回路，与 `grill-send-button` 的验证分工一致。

## 边界与已知取舍

- 建议质量受模型与上下文限制；`fallbackTips` 只保证不裸奔，不保证建议有用。
- `temperature: 0` 与 `maxTokens: 1000` 是经验值；解析链路是最后防线。
- fs 落盘依赖会话工作区可写（沙箱 workspace-write 内成立）；文件路径以
  `agent.session.header.cwd` 为准。
- 建议按「最新一轮」生成：若用户连发多条提问、或建议行被跨轮复用，语义以最新一轮为准。
