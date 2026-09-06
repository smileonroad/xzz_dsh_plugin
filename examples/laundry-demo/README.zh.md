# laundry-demo

[English](README.md) | 中文

一家投币洗衣店。模型决定要洗点什么，就调一次 `laundry_start`；滚筒转起来，聊天里出现一张洗衣卡——进度一格一格往上爬，最后一句"洗好了"。让它洗件衬衫，看卡片慢慢填满。

这张卡片是 **Client 对话节点**，而这是第一个写浏览器侧插件代码的实战。之前的实战（helloworld-command → gatehouse-demo）全跑在 Node 进程里：命令、工具、服务、事件。洗衣店的 Host 半侧也还是这样——`laundry_start` 是个工具，往 session 日志里追加 `laundry/start`、`laundry/progress`、`laundry/done`。Client 半侧住在浏览器里：一个 **Definition** 把这个事件族折叠成一个 keyed 聊天节点（那张洗衣卡），一个渲染器把它画出来。两半侧从不直接见面，连接它们的只有那条持久的 session 日志。

## 运行

本目录是**权威源码**。先把它拷进 deepseek-harness 源码树（那边的同名目录可能过时），再到 deepseek-harness 根目录操作：

```sh
# 1. 拷进 deepseek-harness 源码（本仓库是权威来源）
cp -r examples/laundry-demo ../deepseek-harness/examples/laundry-demo

# 2. 跑测试（3 个 spec，21 个用例，进程内）
cd ../deepseek-harness
pnpm exec vitest run --config examples/laundry-demo/vitest.examples.config.ts examples/laundry-demo
```

测试是行为门槛：用 fixture session 事件（工具真正追加的那批 `laundry/*` 事件）驱动**真实的** `ConversationNodeAssembler`，把 Definition 钉死在官方 cookbook 的 6 点验证上；Host 工具则走真实的 `ToolRuntime`。不开浏览器、不需要模型 key。

把 Host 半侧挂进 profile（web 或 headless）用 patch，entry name 的解析规则和 junction 技巧见 `laundry.patch.yml` 文件头：

```sh
pnpm dsh web --patch examples/laundry-demo/laundry.patch.yml
```

让模型洗点什么：工具把循环记进 session 日志（web 的轨迹面板可见，headless 可重放），里面就是完整 `laundry/*` 事件族。想在浏览器里亲眼看到卡片，需要把 Client 半侧打成 bundle——见[分发](#分发)。

## Design

### Session 事件：Client 能看见什么

整个实战围着一条分界线转。cordis 事件（`ctx.emit('tea/ready')`）是活的：只在响的那一下存在，响完就没了。**session 事件**（`agent.session.append('laundry/start', …)`）是 session 日志里一条带序号的持久记录——永远可重放、可以从历史翻出来。Client 半侧只能消费 session 事件：它不读实时内存，画出的每张卡都必须能只凭日志重建。这就是"Client 是 session 的投影"的含义——这个实战把 tea-shop 的事件族从实时分发挪进持久日志，再把消费方挪进浏览器。

### 故事对照

| 洗衣店 | conversation-node seam |
|---|---|
| 投币 → 滚筒开始转 | `laundry/start`（唯一 start，稳定 `laundryId`） |
| 滚筒 45% → 60% | `laundry/progress`（update，高频增量） |
| 甩干结束，开门取衣 | `laundry/done`（update，terminal） |
| 聊天里一张洗衣卡 | Definition → keyed 聊天节点（`laundry-job`） |
| 翻历史会话，卡还在 | 事件从日志重放 |
| 两台机器各转各的 | 同 kind 两个 id → 两个 Context |

### Host 半侧：一个会记账的工具

`laundry_start`（`src/machine.ts`）是个普通根作用域工具，只有一个花招：`execute` 里读 `exec.agent`，往那个 agent 的 session 追加事件。先落 `laundry/start`（分配稳定 id `laundry-<n>`），再挂一条定时器链，追加 `steps` 次 `laundry/progress`，最后以 `laundry/done` 收尾。循环可取消，插件卸载时取消所有在跑的循环。没有活的 agent 就没有可写的日志，所以工具直接抛错——把失败亮出来，而不是静默吞掉。

事件词表本身（`src/events.ts`）是**纯类型导出**：`SessionEventMap` 声明合并和 payload 类型都放这里，消费方可以仅类型导入，永远不会把 Host 代码拖进浏览器 bundle。

### Client 半侧：Definition 与 keyed 节点

Client 插件（`src/client/`）在 `apply` 里做两件事：

- `ctx.conversationEvents.register(laundryDefinition)`——"洗衣事件归我管"。
- `ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'laundry-job' }, LaundryNodeView))`——"kind 是 `laundry-job` 的节点用我的渲染器画"。

**Definition**（`definition.ts`）是脑子。cookbook 的纪律：

- `match(event)` 是**身份提取器，不是 fold**：它一次只见一条事件，返回 `{ id, role }` 或 null。`laundry/start` 开一个 Context，`laundry/progress`/`laundry/done` 更新它。正因为一条事件只 match 一次，引擎的 append 热路径才能保持常数时间。
- `start`/`update` 返回新的不可变 State。没有"最近那个没洗完的"这种猜测：id 跟着每条事件的 payload 走，所以同一窗口里两台机器各更新各的卡。
- `buildViewNode` 把 State 投影成渲染器的 `data`，永远挂在同一个 `context.key` 下。materialized 的节点绝不撤回——暂时离开可见流要用 `visibility: 'hidden'`，不是返回 null。

kind 通过合并 ui-conversation 契约注册：

```ts
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    'laundry-job': LaundryChatData
  }
}
```

聊天视图按 `kind` 把每个节点派发到 keyed 的 `conversation.chat.node` 槽位——我们的渲染器只画 `laundry-job` 节点，别的也画不了。

### 三条摄入路径，同一次回放

引擎通过三条路径把日志喂给每个 Definition，测试逐条钉死：

| 路径 | 何时发生 | Definition 看到什么 |
|---|---|---|
| replace | open / resync / gap repair | 整个已加载窗口，按 `seq` 序回放 |
| prepend | 更早的一页历史到达 | 只有新到的更早事件；已有 keyed 节点保持身份 |
| append | 一条实时事件 | 一次 `match`，然后一次 `start`/`update`——不扫窗口 |

所以同一族事件，无论实时流入（append）还是从历史重建（replace + prepend），产出的卡都一样——这正是可重放性换来的回报。`publication` 字段再决定 State 变化何时物化成可见节点：

| 事件 | 档位 | 为什么 |
|---|---|---|
| `laundry/progress` | `'animation-frame'` | 高频可见增量合并到每帧一次绘制 |
| `laundry/start` / `laundry/done` | `'immediate'` | 结构性/终态变化不该等 |

`append` 会返回本次请求的物化档位，测试直接断言这个返回值；"每帧最多发布一次"则用连续两次 progress append 后只 flush 一次来钉。

### 渲染器纪律：纯投影

渲染器（`view.tsx`）只读 `node.data`，把每个决定都交给 React-free 的投影函数（`presentation.ts`）：

```ts
projectLaundry(data) // → { line, barWidth } 或 { line, barWidth: null }
```

卡片没有别的逻辑：一行文字，外加滚筒条（只在还在洗的时候有）。测试钉的就是这个投影——Definition 能产出的每一种 data 形状都断言一遍，不依赖组件运行时。

> **Deeper: 为什么测试不渲染 React 组件。**
>
> pnpm 严格 `node_modules` 下，`react` 只链接进声明了它的包；examples 目录没有 package manifest，所以那里的 jsdom spec 解析不到 `react`（这是仓库布局的事实，不是这个例子的选择）。实战用结构性的方式回应 cookbook 的"渲染器只消费 `node.data`"：组件是 `node.data` 经 `projectLaundry` 到标记的薄映射，映射的每个分支都被投影测试覆盖。Client 半侧真正打成 bundle 后（见下），它会像任何 client 包一样在 react 生态里通过类型检查并运行。

## 开发指南

```
laundry-demo/
├── src/
│   ├── events.ts           # 生产方类型：SessionEventMap 合并 + payload（纯类型导出）
│   ├── machine.ts          # Host 半侧：laundry_start 工具，定时器驱动循环，可取消
│   └── client/
│       ├── definition.ts   # Client 半侧：ConversationNodeDefinition + ChatNodeDataMap 合并
│       ├── presentation.ts # 纯卡片投影（React-free，examples 里可测）
│       ├── view.tsx        # 薄渲染器：node.data → projectLaundry → 标记
│       └── index.ts        # apply：注册 Definition + keyed 槽位渲染器
├── tests/
│   ├── laundry-machine.host.spec.ts      # 8 用例——真实 ToolRuntime + fake agent
│   ├── laundry-definition.client.spec.ts # 8 用例——真实 ConversationNodeAssembler
│   └── laundry-view.client.spec.ts       # 5 用例——纯投影，每种 data 形状
├── cordis.yml            # 组合：Host 半侧 + Client 半侧
└── laundry.patch.yml     # profile overlay（只有 Host 半侧）
```

- `src/events.ts`——只有类型。`declare module '@deepseek-ai/dsh-session/types'` 这个合并让两半侧的 `session.append('laundry/start', …)` 和 `event.type === 'laundry/start'` 都有类型。Client 文件用 `import type {}` 引它——和 cookbook 在真实包边界处规定的仅类型副作用导入是同一个动作。
- `src/machine.ts`——`name = 'laundry-machine'`，`inject = ['tools']`。工具分配 `laundry-<n>` id、落 start、挂 `steps` 个进度 tick 再落 done，把定时器链存进 Map 以便卸载时取消。无 agent → throw；参数非法 → throw（运行时把抛出的 body 变成带消息的 `isError`）。
- `src/client/definition.ts`——`kind: 'laundry-job'`，`target: 'chat'`。`match` 提取 id，`start` 播种 `{ title, completed: 0, status: 'running' }`，`update` 折叠 progress/done，`publication` 映射档位，`buildViewNode` 在稳定 key 下产出完整聊天节点。
- `src/client/presentation.ts` / `view.tsx`——渲染器的全部行为住在纯投影里，组件就是上面那层薄壳。
- `tests/laundry-definition.client.spec.ts`——用 fixture 事件驱动真实 `ConversationNodeAssembler`，钉 cookbook 6 点：完整 replace 产出最终 State、Location data、节点 payload 与 `anchorSeq`；只有 update 的窗口保持 pending，prepend 补上 start 后与完整 replace 一致；实时 append 等于回放合并；prepend 只增早行、未变化的 keyed value 不被替换；重复可见 delta 保持 `context.key`、请求 `animation-frame`（每帧最多发布一次）；渲染器只消费 `node.data`（纯投影结构落地，见上）。6 点之上另有附加纪律：match 每条事件恰好一次、同窗口双循环各更新各的、start 守卫的 tripwire。
- `tests/laundry-machine.host.spec.ts`——挂 `SystemPrompt` + `ToolRuntime`（真实服务）+ fake agent，走 `ctx.tools.execute` 派发，用 fake timers 驱动循环：事件顺序、tick 时机、参数处理、无 agent 失败、非法参数、disposer 取消、Loader 安全导出。
- `tests/laundry-view.client.spec.ts`——`projectLaundry` 的每个分支：运行中文字 + 条宽、0%/99% 边界、完成摘要、无摘要完成、合并后的 kind/target。

跑测试：

```sh
pnpm exec vitest run --config examples/laundry-demo/vitest.examples.config.ts examples/laundry-demo
```

> 关联说明：本目录是 Client 对话节点实战的完整源码 + 测试包；`notes/2026-09-02-laundry-demo.md` 记录背后的学习过程，成形提案在 `docs/proposals/2026-09-02-laundry-demo.md`。

## 分发

与其他实战一致：这是**教学示例**，不是可安装的包。两个半侧，两条分发故事：

- **Host 半侧**按既有方式直接以源码 `.ts` entry 挂进 patch 层。
- **Client 半侧**只有一条路能进真实浏览器页面：客户端模块系统。页面扫描声明了 `dsh.client` 的 loader entries，把每个包构建好的 `./client` 导出送进页面——不需要重建 web 应用，但前提是包必须真的以那个导出建成 bundle。升级示例走标准打包路径（cookbook 的 `adding-a-conversation-node` 与打包教程），届时只要 profile 挂了这个插件，聊天里就会出现这张卡。
