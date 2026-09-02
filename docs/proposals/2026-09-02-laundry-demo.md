# 提案：laundry-demo —— 投币洗衣店（Client 对话节点）

- 日期：2026-09-02
- 状态：待确认（探索完成，开发前需确认）
- 对应官方指引：[`docs/cookbook/adding-a-conversation-node.zh.md`](../reference/cookbook/adding-a-conversation-node.zh.md)（repo 已有副本）+ 摘要 [`docs/client-plugin.md`](../client-plugin.md)（早已写好、一直没练）
- 系列位置：第 8 个写插件实战；承接 tea-shop / gatehouse 的事件话题——前两实战用 cordis 事件练生产方与监听，本实战把同一套「可回放事件族」用到 **session 事件 + Client 消费**上，练 seam 的浏览器半边（Definition、keyed slot、渲染器、store 纪律里最核心的前三样）
- 探索结论：方向「Client 插件」是 tea-shop / gatehouse 笔记反复点名排第一的最大空缺（「浏览器侧那一套，slot、组件、store 纪律，是另一个世界，值得单独大探索」），官方正好有两篇 cookbook，conversation-node 最深且自带 6 点验证处方；领域用**投币洗衣店**（滚筒转一圈 = start/progress/done，进度条是天然视觉），一看就是 sample，故事和机制一一对应

## 选题依据

1. gatehouse 笔记「接下来该干嘛」：Client 插件是最大空缺，值得单独大探索；`docs/client-plugin.md` 摘要存在已久，官方材料读过、没练过，正好把摘要变成实战。
2. surface 系列（headless/acp/jsonrpc/web/schedule）练的是「agent 怎么被接进来」，全部在 Host 侧跑；浏览器侧插件（客户端模块系统、slots、会话事件渲染）一行没练过。Client 半边是唯一完全没碰过的 seam 角色。
3. 领域 = 投币洗衣店，符合「第一眼测试」：`laundry/start`（投币开洗）/ `laundry/progress`（滚筒进度）/ `laundry/done`（甩干完成）与 Conversation Node 的 start/update 角色天然一一对应，进度条就是 `node.data` 的天然可视化：

| 洗衣店故事 | conversation-node seam |
|---|---|
| 投币 → 滚筒开始转 | `laundry/start`（唯一 start，带稳定 id） |
| 滚筒进度 45% → 60% | `laundry/progress`（update，高频 delta） |
| 甩干 → 完成，开门取衣 | `laundry/done`（update，terminal） |
| 聊天里出现一张洗衣卡 | Definition → keyed chat node（`laundry-job`） |
| 翻历史会话，卡还在 | 事件进 session 日志，可回放重建 |
| 同时洗两台，各转各的 | 同 kind 多 id → 多 Context，按 (kind, id) 精确定位 |

4. 已验证可行性（探索摘要见下）：Assembler 可进程内驱动（`replaceWindow`/`prepend`/`append`/`flush`），官方 6 点验证全部可钉；工具 execute 有 `exec.agent`，根作用域注册的工具就能 `agent.session.append` 落事件；`@deepseek-ai/dsh-client-runtime/client` 有 tsconfig paths 映射（源码解析），ui-conversation 只做 type-only import（`ChatNodeDataMap` 合并 + `ChatNodeViewProps`）。

## 探索摘要（关键事实）

- **session 事件 vs cordis 事件是本实战的核心分水岭**：Client 绝不读实时内存，只消费 session 日志里带 `seq` 的可回放事件；生产方用 `declare module '@deepseek-ai/dsh-session/types'` 合并 `SessionEventMap`（type-only 导出，schedule 同款），用 `agent.session.append('laundry/start', …)` 落账（append-only，不直接改状态）。
- **坐标由引擎推导，工具不用算**：Assembler 的 locationIndex 从 `turn/start`/`step/start` 边界事件推导位置，坐标自由事件落进当前 open step；工具在 step 里 append 即落在该 step，payload 不必带 turn/step（cookbook 的 review job 带坐标是可选教学点，本实战用引擎坐标，更诚实）。
- **Definition 契约**：`kind`/`target`/`match`（身份提取器，非 fold）/`start`/`update`（返回新 immutable State）/`publication?`（start/done → `'immediate'`，progress → `'animation-frame'`）/`buildLocationData?`/`buildViewNode`（同一 key，materialized 后不许 null 撤回）。`(kind, id)` 最多一条 start；update 先于 start 时 pending，prepend 补到 start 后激活。
- **Assembler 测试装配**：`new ConversationNodeAssembler(new TestEventDefinitions([def]), new TestViewDefinitions([view]))`，`replaceWindow(entries, hasMore)` → 恒 `'immediate'`，`append(input)`/`prepend(entries, hasMore)` → 返回最高 publication 档位（`'none' | 'animation-frame' | 'immediate'`），`flush()` 物化一次（多次 append 一次 flush = 每帧最多一次发布）；`assembler.snapshot('chat')` 读快照。runtime 自带 `conversation-assembler.client.spec.ts` 是现成样板（`at(seq, type, data)` 造事件）。
- **工具路径**：根作用域 `ctx.tools.register(defineTool({…}))`，`execute(args, exec)` 里 `exec.agent`（agent loop 设置，tools 源码 line 325 注释明示）→ `agent.session.append`；无 agent 时返回错误值（工具无会话可落账）。真实 ToolRuntime + fakeAgent（`{ session: { events, append } }`）即可测试。
- **slot 注册**：`ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'laundry-job' }, LaundryNodeView))`；该 slot 是 keyed/session 作用域，`keyProps` 是 `{ node: ChatNode<Kind> }`（ui-conversation `src/client/contract/slots.ts` line 115 确认）。
- **类型接线**：`ChatNodeDataMap`（`@deepseek-ai/dsh-client-ui-conversation/client`）+ `ConversationStepDataMap`（runtime/client）declare merge；ui-conversation 的 `/client` 子路径无 tsconfig paths 映射，但 type-only import + 合并解析到 built lib 类型（`lib/types/client/index.d.ts` 存在），运行时零加载，无双实例风险。
- 工具名 `laundry_start` 与 `laundry/*` 事件族全仓库无冲突（已 grep 确认）。

## 实战形态

```
examples/laundry-demo/
├── src/
│   ├── events.ts          # 生产方类型：SessionEventMap 声明合并 + payload 类型（纯类型导出）
│   ├── machine.ts         # Host 半侧：laundry_start 工具 + 洗衣循环（append 事件族，可取消）
│   └── client/
│       ├── definition.ts  # Client 半侧：ConversationNodeDefinition（match/start/update/publication/buildViewNode）
│       └── view.tsx       # 渲染器：chat node 组件（进度条，只消费 node.data）
├── tests/
│   ├── laundry-machine.host.spec.ts     # Host：工具 append 事件族（真实 ToolRuntime + fakeAgent）
│   ├── laundry-definition.client.spec.ts # Client：Assembler 驱动 6 点验证（node env）
│   └── laundry-view.client.spec.ts      # Client：jsdom 渲染（只消费 node.data）
├── cordis.yml
├── laundry.patch.yml
└── LICENSE
```

| 插件 | 角色 | 教学点 |
|---|---|---|
| `laundry-machine`（Host） | 事件生产方 + 工具 | `declare module '@deepseek-ai/dsh-session/types'` 合并事件族；`laundry_start` 工具（args：`title`/`steps`/`interval_ms` 带默认）投币开洗——先 append `laundry/start`（稳定 id），再按间隔 append `laundry/progress`（steps 次），最后 append `laundry/done`（summary）；disposer 可取消循环；无 agent → 错误值 fail loud；`inject: ['tools']` |
| `laundry-node`（Client） | 事件消费方 + 渲染 | Definition：`match` 身份提取（start → start 角色，progress/done → update 角色）；`start`/`update` 返回不可变 State（title/completed/status）；`publication`（progress → animation-frame，start/done → immediate）；`buildViewNode` 产出 `{ key, kind: 'laundry-job', id, location, data }`（同一 key 不撤回）；渲染器纯 props 消费 `node.data`（洗衣中 45% / 完成+summary）；`ctx.conversationEvents.register` + `ctx.slots.inject('conversation.chat.node', …)` |

故事默认参数（cordis.yml / patch 里配或工具默认）：`title: '日常洗衣'`，`steps: 4`，`interval_ms: 800`——模型调 `laundry_start` 后聊天里滚筒转起来，进度节点逐格涨，最后开门取衣。

测试与验证方式（约 14 用例，进程内、零外部依赖，真实 Assembler + 真实 ToolRuntime）：

- **Host 半侧**（工具 append）：`laundry_start` 先落 `laundry/start`（稳定 id）；进度事件按序跟上、`laundry/done` 收尾；除事件族外无其他写入（append-only）；无 agent → 错误结果；fake timers 驱动完整循环（start → N×progress → done）；disposer 取消后不再追加
- **Client 半侧**（Assembler，cookbook 6 点）：
  1. 完整 replace → 最终 State、Node payload、`anchorSeq`、location 落在正确 step
  2. 只有 update 的尾部窗口 = pending；prepend 唯一 start 后 == 完整 replace
  3. 实时 append 与回放合并结果一致
  4. prepend 更早分页只增行，未变化 keyed value 不被替换
  5. progress → `'animation-frame'`、start/done → `'immediate'`（append 返回值断言）；两次 progress append + 一次 flush → apply 恰好一次（每帧最多一次）
  6. 渲染器只消费 `node.data`（jsdom 真 props 渲染，无 ctx）；`match` 是身份提取器（spy 每次事件恰好一次 match，Assembler 常数时间热路径由引擎保证）
- 附加纪律：同 kind 双 id（两台洗衣机同时转）→ 两个 Context 各更新各的；materialized 后 `buildViewNode` 不返回 null（引擎抛 withdraw 错误的镜像断言）；Loader 安全导出（name / inject 形状）

验证闭环：测试（行为，进程内门槛）+ 组合树（cordis.yml / patch 挂 Host 半侧）+ 可选真实轮次（`--patch` 挂进 headless/web，模型调 `laundry_start`，session 日志出现事件族；真实浏览器渲染需要 clientBundle 分发路径，见风险 3）。

## 风险与开放问题

1. **`ChatNodeDataMap` 合并目标**：`@deepseek-ai/dsh-client-ui-conversation/client` 无 tsconfig paths 映射，合并解析到 built lib 类型。开发第一步先验证合并生效（`ChatNode<'laundry-job'>` 类型成立）；若失败，改从 `'@deepseek-ai/dsh-client-ui-conversation/src/client'`（package exports 的 `./src/*` 映射，源码路径）导入/合并。type-only 导入运行时零加载，无双实例风险。
2. **事件坐标**：坐标由引擎从边界事件推导（locationIndex），payload 不写 turn/step。若实测节点落点不对（如事件落在 session 而非 step），回退方案是工具从 `exec.agent` 取当前坐标显式写入 payload（cookbook 的 review job 就是这么干的）。开发时用含 turn/start+step/start 的 fixture 钉死落点。
3. **真实浏览器验证门槛**：Client 半侧进真实 web 需要构建为带 `dsh.client` 声明的 clientBundle 包（客户端模块系统按 `./client` 导出加载，官方文档明示无需重建 web 应用，但示例目录没有 package.json/build 管线）。本实战进程内套件是行为门槛（与 gatehouse 一致）；真实挂载走「分发为可安装 bundle」的完整流程（`docs/plugin-package.md`），在 README 里讲清边界，不作为本实战交付物。
4. **渲染器测试装配**：jsdom 渲染需要 `react`/`react-dom` 可解析（workspace 有，`// @vitest-environment jsdom` pragma）；`ChatNodeViewProps<'laundry-job'>` 类型源自 built lib types。若 jsdom 渲染遇到 react 版本/解析问题，退化为「buildViewNode 数据形状断言 + 渲染器纯函数拆分」，渲染器按 cookbook 保持最小实现。
5. **animation-frame 的 flush 语义**：`flush()` 一次物化多次 append 的脏 Context，镜像 runtime 自带 spec 的 `testView`（apply 计数）断言「每帧最多一次」，不引入真实 rAF。

## 否决项（探索阶段明确不做）

- 不做 clientBundle 构建/真实浏览器挂载：那是「分发」实战（`docs/plugin-package.md` 全流程），本实战进程内套件是行为门槛
- 不做 `reader.previous` 前序依赖：cookbook 的进阶特性，洗衣店作业互相独立用不上，README 里点一句即可
- 不做 store 纪律（`createXXXStore` 工厂 / actions）：本实战渲染器无共享状态，store 纪律留给后续 Client 实战
- 不做 settings-card（`adding-a-settings-card`）：官方另一个 Client cookbook，比 conversation-node 轻，且验证更依赖真实 web；conversation-node 自带 6 点进程内验证处方，是更好的第一个 Client 实战
- 不改 harness 源码：runtime / ui-conversation / tools / session 零改动，纯消费方示例
- 不重复 runtime 自身测试已覆盖的引擎行为——测试钉的是**洗衣店的事件族契约 + Definition 决策 + 渲染器消费纪律**，引擎行为只做契约证明

## 开发收尾（2026-09-02，提案确认后实测记录）

- **风险 1 兑现并修复**：`declare module '@deepseek-ai/dsh-client-ui-conversation/client'` 能解析（examples/node_modules 的 workspace 链接 + built lib 类型），但定向 tsc 探针抓到另一个同族缺陷——definition.ts 没把 events.ts 的 SessionEventMap 合并引入 client 程序，`match` 里 `laundry/*` 比较被判定永假，12 条类型错误，vitest 全绿看不见。修法即 cookbook 的「仅类型副作用导入」（`import type {} from '../events.ts'`），探针清零。
- **风险 4 兑现**：pnpm 严格布局下 examples 目录解析不到 react（react 只链接进声明了它的包），jsdom 渲染不可行，按退化预案落地——渲染器行为抽成 React-free 纯投影（`src/client/presentation.ts`），组件只做薄映射；投影测试覆盖每种 data 形状。补充发现 examples 的 vitest include 只匹配 `*.spec.ts` 不带 tsx，渲染 spec 以 .ts 落盘，内容只测 React-free 投影（不 import react，也无需 createElement）。
- 验证闭环落地：21 用例（Host 8 + Definition 8 + 投影 5）进程内全绿；host/client 双 tsc 探针 laundry-demo 文件 0 报错（临时探针已删）；真实浏览器挂载边界不变，仍走 clientBundle 分发路径。
