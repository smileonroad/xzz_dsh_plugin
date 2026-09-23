# 2026-09-02 — laundry-demo，Client 对话节点，浏览器里那个画师

## 事情是这样的

gatehouse 那篇结尾把候选又排了一遍，Client 插件还是最大的空缺，说浏览器侧那一套是另一个世界，值得单独大探索。中间插进来的 surface 系列把接入方式摸了个遍，headless、acp、jsonrpc、web、schedule 全实测跑通，但那五篇练的是「agent 怎么被接进来」，全在 Host 侧转，一行浏览器插件代码都没写过。空缺还是空缺。

这次补上。故事是投币洗衣店，模型调 `laundry_start`，滚筒转起来，聊天里出现一张洗衣进度卡。这张卡就是 Client 对话节点，官方 cookbook 的 adding-a-conversation-node 是这一题的教科书，自带的 6 点验证处方正好能当测试清单。

## 这半题的本质是换了一条事件流

动手前先把最绕的一点想清楚，Client 到底消费什么。

前几个实战里的事件都是 cordis 事件，`ctx.emit` 响一下就没了，活在实时内存里。Client 不在这条路上。浏览器那边没有内存里的 Context 可以读，它只能读 session 日志里带 seq 的事件，那是一条持久、可回放、能从历史往前翻的记录。tea-shop 练的是自己声明事件族再 emit，这次把事件族从实时分发挪进 session 日志，靠 `agent.session.append` 落账，消费方也从 Node 进程挪进浏览器。

```
tea-shop                          laundry
生产方 emit 事件 → 监听方即时响应    工具 append 事件进 session 日志
                                      │
实时内存，响过就没了                  ▼ 事件流推到浏览器
                                  Definition 折叠 → 聊天卡片
                                  重放同一份日志，卡片一样
```

一句话概括，Client 是 session 日志的投影。它不知道工具被调过，只看见事件，所以同一份日志在任何时间任何环境重放，产出的界面必须一致。这是整道题的第一条纪律，测试也按这个来钉。

## Definition 契约先摸清楚

契约在 deepseek-harness 的 `packages/client/runtime/src/client/contract/conversation.ts`，核心是 `ConversationNodeDefinition`，六个字段。

```
kind            业务 kind，聊天节点按它派发
target          渲染目标，chat
match(event)    身份提取器，一条事件一次，返回 { id, role } 或 null
start/update    返回新 State，不可变
publication?    物化档位，immediate / animation-frame / none
buildViewNode   把 State 投影成渲染器能直接消费的 data
```

match 是身份提取器，不是 fold。它只见当前这一条事件，从 payload 里抠出稳定业务 id 和生命周期角色，`laundry/start` 是 start 角色，`laundry/progress` 和 `laundry/done` 是 update 角色。同 kind 同 id 只允许一条 start，两条就抛错。引擎靠这个性质保住热路径，一条新事件对每个 Definition 各做一次 match，绝不回头扫窗口。

start 和 update 都返回引擎随后采纳的 State。id 必须跟着每条事件的 payload 走，绝不能猜「最近那个没洗完的」，同一窗口里两台洗衣机各转各的，靠的就是这个。

materialized 的节点不许撤回。buildViewNode 一旦为某个 context.key 产出过节点，之后就得继续返回同一个 key，想暂时离开可见流用 `visibility: 'hidden'`，返回 null 会被引擎当作 withdraw 直接抛错。cookbook 里 review job 的完整实现，和仓库里现成的外部包样板 ui-workflow-run 的 `workflow-definition.ts`，就是我写 definition.ts 时的两份参照。

## Assembler 可以在进程里直接驱动

写完 Definition 怎么验证，这是这题能不能做成的关键。浏览器里事件由运行时喂给引擎，测试里没有浏览器，但引擎本身可以单拎出来直接喂。

`ConversationNodeAssembler` 公开了三条摄入路径和一次 flush。

```
replaceWindow(entries, hasMore)   完整窗口重建，open/resync/gap repair 用
prepend(entries, hasMore)         更早一页历史补进来
append(input)                     一条实时事件
flush()                           物化脏 Context，推给视图构建器
```

每个 append 或 prepend 都会返回这次请求的最高物化档位，start 和 done 是 immediate，progress 是 animation-frame。测试直接断言这个返回值，publication 的契约就钉死了。「每帧最多发布一次」则用连续 append 两次 progress 再 flush 一次来钉，apply 恰好被调用一次。

装配是最小栈，runtime 自带测试 `conversation-assembler.client.spec.ts` 就是现成样板，Definition 列表和视图构建器各做一个替身类传进去就行，一个 `at(seq, type, data)` 函数造事件。snapshot 直接从 `assembler.snapshot('chat')` 读。

这套在进程内把 cookbook 的 6 点全钉住了，replace 的最终结果、pending 窗口补 start、实时 append 等于回放合并、prepend 只增行不换 keyed value、重复 delta 保持 key 且每帧最多发布一次、渲染器只消费 node.data。零外部依赖，不需要模型 key。

## Host 半侧还是老一套，工具会记账了

生产方是普通工具，`laundry_start`，根作用域注册，唯一的机关在 execute 里。

```
execute(args, exec)
   │  exec.agent 由 agent loop 设置（tools 源码 line 325 附近有注释）
   ▼
agent.session.append('laundry/start', { laundryId, title })
   │  再挂定时器链
   ▼
按 steps 次 append laundry/progress
   ▼
最后 append laundry/done
```

事件词表单独放一个文件，纯类型导出，`declare module '@deepseek-ai/dsh-session/types'` 把三个事件合进 SessionEventMap。这样两半侧的 append 调用和 match 比较都有类型，消费方仅类型导入，不会把 Host 代码拖进浏览器 bundle。

循环挂的是真定时器，默认 4 格 × 800 毫秒，卸载插件时全部取消。没有 agent 就没有可写的日志，直接 throw，运行时把抛出的 body 包成 isError，把失败亮出来，而不是静默吞掉。

## 开发里撞的两堵墙

第一堵是 jsdom 渲染。计划里渲染器要用 jsdom 假装屏幕试画，结果 react 根本解析不到。pnpm 严格布局下 react 只链接进声明了它的包，examples 目录没有 package manifest，往上翻到仓库根也没有 react。这是仓库布局的事实，不是代码问题。解法是把渲染器的全部行为抽成一个 React-free 的纯投影函数，卡片组件只剩一层薄映射。投影函数在 examples 里随便测，每种 data 形状都断言一遍，行为照样钉死。这正好踩中提案风险 4 预埋的退化预案，渲染器按 cookbook 保持最小实现，测试钉纯函数。

第二堵墙更有价值，是 tsc 探针抓出来的。vitest 不 typecheck，21 个用例一路全绿，我以为类型没问题。结果定向跑了一遍 tsc，definition.ts 里 12 条报错，match 里 `event.type === 'laundry/start'` 被判定为永假比较。原因是我只把事件词表放进了 Host 程序，Client 程序里没有 events.ts，SessionEventMap 的合并没有生效，事件类型停留在核心词表，laundry 的三个事件不在里面。修法就是 cookbook 早就写好的那一句，Client 用仅类型副作用导入把生产方的合并拉进来。

```ts
// src/client/definition.ts
import type {} from '../events.ts'
```

这个坑提醒我一件事，行为全绿和类型正确是两回事，声明合并这类跨文件契约，vitest 永远不会替你验证。同类的还有个小的。examples 的 vitest include 只匹配 `.spec.ts`，view spec 起初是 .tsx，跑目录时整份不被发现；改名 .ts 后进了套件，随即撞上第一堵墙的 react 解析，渲染器改成纯投影后，spec 里连 react 都不再 import。

## 二十一个用例，一次全绿

进程内装配，Host 侧照 gatehouse 的姿势，SystemPrompt 加 ToolRuntime 加 fake agent，走 ctx.tools.execute 派发，fake timers 驱动完整洗衣循环。Client 侧照 runtime 自带 spec 的姿势，真实 Assembler 加 fixture 事件。

二十一个用例按组看。

Host 半侧八个。start 先落、id 稳定、标题默认。完整循环的事件顺序，start 接三格 progress 接 done，中间没有别的东西。tick 落在计划的时间点上，跑一半看进度、跑完看 done。参数生效，item、steps、interval 都能改。没有 agent 直接抛错。非法参数逐个拒。disposer 卸载后循环取消，再推进一万毫秒也不追加。Loader 安全导出。

Definition 八个。完整 replace 产出最终节点，data、location、anchorSeq 全对。只有 update 的窗口保持 pending，prepend 补上 start 后和完整 replace 结果一致。实时 append 等于回放合并。prepend 只增早行，既有 keyed 节点的 key 和值都不动。publication 档位三条，progress 是 animation-frame，start 和 done 是 immediate，两次 progress 加一次 flush 只 apply 一次。match 每条事件恰好一次。双循环同窗口各更新各的。start 守卫对错误事件直接抛。

投影五个。运行中文字带条宽，0% 和 99% 边界原样投影，完成态带摘要不带条，无摘要完成态可读，合并后的 kind 和 target 正确。

一次全绿。引擎自身的行为不重复测，那是 runtime 自己的测试范围，测试钉的是洗衣店的事件族契约、Definition 的决策和投影的输出。

## 接下来该干嘛

Client 这扇门开了一半。这次练的是对话节点，Definition、keyed 槽位、纯投影渲染，都是浏览器侧的骨架。还剩下几块没碰。

store 纪律是明摆着的一块，`createXXXStore` 工厂、actions 写路径、模块级单例禁止，渲染器这次没有共享状态所以用不上，适合单独练。settings-card 是官方另一个 Client cookbook，比对话节点轻，但验证更依赖真实 web，和分发路径绑在一起。真实浏览器挂载本身就还是半道题，Client 半侧要打成带 `dsh.client` 声明的 clientBundle 才进得了页面，那是分发实战的完整流程。

units 多 provider 那半道题还在，生命周期和 effect 的系统梳理也还挂着。想碰哪个，都可以从探索开始。
