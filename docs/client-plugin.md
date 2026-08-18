# Client 插件（Web UI 侧）

> 摘要：Web Client 侧插件两条主线：Conversation Node（把持久 Session 事件族渲染成 Chat 节点）与 Client 包纪律（slots/props/分层红线）。
> 上游：[`reference/cookbook/adding-a-conversation-node.zh.md`](../reference/cookbook/adding-a-conversation-node.zh.md) + deepseek-harness `packages/client/AGENTS.md`（hash 只覆盖本仓库内副本；AGENTS.md 位于 deepseek-harness 源码，不在本仓库）。

## Conversation Node：一条业务线的完整链路

### 1. 设计可回放的事件族

先定稳定业务 id：构成同一 Node 的每条事件都携带该 id，或只凭 payload 独立推导。**Client 绝不把 update 猜成「最近一个未完成」的 Context**。事件约定例（review job）：

| 事件 | 角色 | 必须持久化的事实 |
|---|---|---|
| `review/start` | 唯一 start | `reviewId`、Turn/Step 坐标、标题 |
| `review/progress` | update | 相同 `reviewId`、坐标、可回放进度 |
| `review/end` | update | 相同 `reviewId`、坐标、最终摘要 |

每个 `(kind, id)` 最多一条 start。增量事件按日志 `seq` 升序回放必须确定性地产生 State，不依赖实时内存。start 在窗口外时，terminal/checkpoint 事件要带足够 fallback 状态。

### 2. Definition 三件套

- `match(event)`：**身份提取器不是 fold**。只收当前事件，返回 `{ id, role: 'start' | 'update' }` 或 `null`。
- `start(context, match)` / `update(context, match)`：返回引擎随后采用的 State（推荐新 immutable 值）。
- `buildViewNode(context)`：返回 renderer 可直接消费的数据。Node 一旦发布就保持同一个 `context.key`；暂时离开可见流用 `visibility: 'hidden'`，**不返回 null 撤回**。

类型接线：事件 payload 经 `SessionEventMap` 声明合并（生产方纯类型导出，Client 仅类型副作用导入）；Chat data 经 `ChatNodeDataMap` / `ConversationStepDataMap` 合并；`buildLocationData` 把 Definition 数据发布到 Turn/Step，同 Location 内其他 Node 用受限 hook（如 `useTurnData(key)`）读取，不扫 Session。

### 3. 三条摄入路径（都要保持常数时间热路径）

| 路径 | 引擎工作 | Definition 观察 |
|---|---|---|
| replace（open/resync/gap repair） | 重建窗口，事件逐一匹配后回放 | 先 start 再按 seq 升序 update；只有 update 的 pending Context 仍无 State |
| prepend 更早历史 | 只匹配新事件，合并进 Context | 新 start 激活已收集 update；Location/依赖变化可重跑 Context |
| append 实时事件 | 每 Definition 一次 `match`，只更新命中 Context | 一次 update + 一次发布 |

注册 D 个 Definition 时，一条新事件 = D 次仅当前事件匹配；**热路径不得遍历事件窗口、全部 Context、`context.matches` 或已渲染 Node**。累计事实进 State，同 Turn/Step 共享进 Location data，前序依赖用 `reader.previous<State>(kind)`（只在 start 里查，引擎记录依赖并负责重跑）。

`publication`：结构/terminal 变化 `immediate`，高频 delta `animation-frame`，只积累 State `none`。

### 4. 验证六件事

完整 replace 的最终结果；pending 窗口 + prepend start == 完整 replace；实时 append == 回放合并；prepend 只增行、不变 keyed value 不替换；重复 delta 保持 key 且每帧最多一次；renderer 只消费 `node.data` 与受限 hook。

## Client 包纪律（AGENTS.md 要点）

### slots 与 props

- **一个 API**：`ctx.slots.register({ name, children?, store?, inject? }, Component)`，无独立的 slot 定义调用。shell 只渲染 `'root'`。
- **children = 声明 + 授权**：渲染没声明的 slot 或声明别人声明过的，加载即失败（冲突是设计在说话）。slot 名镜像组合路径 `<domain>.<entry>.<hole>`。
- **组件 props 是四个派生 share**：`PropsRuntime`（owner 参数 + session hooks）+ `PropsRenderSlots`（children keys）+ `PropsStore`（store 工厂）+ inject face。不手写 share 已派生的成员。
- **五个常设 hook**：`useSession` / `useSessions` / `useWorkspaces` / `useStore` / `renderSlot`，加 renderer 从 inject `hooks` 舱绑定的 `use<Name>`。业务代码不自己造 hook/selector 作为 prop 值，传纯数据与回调。
- **实时数据只有三条通道**：父级知道 → renderSlot 处的 owner props；只有组件知道 → 本地 state；跨入口共享/跨 remount 存活 → register 处声明的 store。派生数据是 `useMemo` 纯函数，不是独立订阅。
- **store 纪律**：读 `props.useStore`、写 `props.actions.*`（actions 是完整变更 API）；写成导出的 `createXXXStore()` 工厂（模块级单例禁止）；生产代码只在 `apply` 内调工厂。

### 分层红线

1. **数据对象层**（runtime，React-free）：`ConnectionController` → `SessionManager` → `Session` 持有全部业务状态；snapshot-store 引擎（zustand/immer）也在这层。零 React import。
2. **渲染机械**（web-react，shell 专用胶水）：ctx→React 集成全部在这，业务插件包不依赖 web-react。
3. **展示组件**（插件包 `src/client/`，纯 props）：随时可整包重写，业务逻辑不进。

不可协商项：业务数据在对象层、绝不在 store；`notifyNow` 只用于用户手势直接回显，结构性更新用 microtask 批量的 `markDirty`，可见流式块用累积 `markFrameDirty`；web 层纯展示，「怎么画」不进 session log；新增模型可见输入仍要 session 事件（仓库级规则）。

### 导出纪律与测试

- `/client` 入口是公开浏览器 API：只导出 cordis 加载需要的（`apply`/`inject`/`Config`）+ 类型专用 store 工厂 + 共享类型。实现组件、常量、store 句柄保持内部；**加任何新值导出要用户签字**。
- 同包测试直接相对 import 内部；跨包 import 其他插件符号原则上禁止（正路是 slot 系统与 ctx 服务）。
- 组件永不接触 ctx：数据全走四个 props share。
- 覆盖率：client 源码包在逐文件 100% 门禁内；组件 spec 用真实 props 或驱动 fixture runtime，断言用户可见行为；jsdom 环境用文件头 `// @vitest-environment jsdom` pragma。
- 目录制：一个 UI 功能 = 一个插件包（`src/client/` 浏览器半边），多域包按 `ui-conversation` 模式分 `contract/` + 域目录 + 单一 `apply.ts` 装配点。
- 文案中文、代码注释英文；样式用共享 `--dsw-*` token + CSS Modules，无组件库无 Tailwind。
