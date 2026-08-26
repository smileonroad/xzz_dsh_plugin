# 2026-08-26 — gatehouse-demo，审批的应答者，策略代替用户作答

## 事情是这样的

上篇 tea-shop 把事件话题收口了，监听和声明都练完，结尾列了几个候选。approval/request 自动审批是排在第一位的，events-demo 那篇就点名过，说它是 harness 里另一个真实 waterfall，教程也点名过，策略可以代替用户作答。

这次的故事是传达室。老式单位门口那间小屋，访客登记，大爷翻名单，常客放行，黑名单拒之门外，陌生人打电话问人，没人接就进不去。门禁这个场景和 approval/request 的机制是天然一一对应的，不需要像报销金额那样把领域数据硬塞进 reason 里。

## 先把 seam 摸清楚，三个角色

动手前把 approval 这条链从源码捋了一遍，packages/interaction/user-approval/src/index.ts 是 Definition，整条链长这样。

```ts
// packages/interaction/user-approval/src/index.ts（节选）
interface Events {
  'approval/request'(this: Scoped<ApprovalService>, req: ApprovalRequest, next: () => Promise<ApprovalOutcome>): Promise<ApprovalOutcome>
}
```

waterfall 事件，应答者返回结果就是认领，调 next() 就是委托。整条链走一遍就清楚了。

```
工具想执行
   │  tools/pre-execute 监听器返回 { kind: 'ask', reason }
   ▼
serviceAsk（dsh-tools 里的唯一问法）
   │  ctx.approval.request(req)
   │  日志先写 approval/asked
   ▼
approval/request waterfall，应答者按注册顺序被问到
   ├─ 应答者直接返回结果 → 认领，链条终止
   ├─ 应答者调 next()    → 传给下一个
   └─ 无人认领           → 默认 unavailable
   ▼
日志补写 approval/decided（同 id），返回 outcome
   ▼
工具执行器映射：allowed-once 放行，其余拒绝
```

结果词汇是闭集，一共四种。

```
allowed-once   唯一放行，只管这一次
rejected       明确拒绝
cancelled      问题被撤回，迟到的答案作废
unavailable    兜底，默认不放行
```

unavailable 是兜底结果。没有应答者、应答者抛错、返回值不在词汇里，三种情况最后都落到它头上，serviceAsk 看到的都是它。应答者的异常被机制消化在链条内部，废的只是这一单问题，调用方的工具调用不受牵连。

```
没有应答者          ┐
应答者抛错          ├─→ unavailable → 工具执行器按拒绝处理
返回值不在词汇里    ┘
```

问问题的人只有一种姿势。某个 tools/pre-execute 监听器说「这个工具要先问一下」，serviceAsk 就把这句话变成一次 ctx.approval.request，拿到 outcome 后映射回工具结果，allowed-once 放行，其余一律拒绝。

```
tools/pre-execute 返回 { kind: 'ask', reason }
   │
   ▼
serviceAsk 调 ctx.approval.request
   │
   ▼
映射回工具结果：allowed-once 放行，其余拒绝
```

走这条路的有两个。facilities 的三个被门禁工具在 pre-execute 里返回 ask，不另造 ask 工具；tool-bash 的沙箱升级也在这条路上，approveEscalation 传的是同一个 approval 服务。

真实世界的应答者有两个，认领规则各不相同。

```
apiproxy    web UI 应答者，认领一切审计过的请求，往浏览器发弹窗等用户点
ACP bridge  机器应答者，只认领自己 agent 的请求，别人的调 next() 委托
```

纪律只有一条，谁的问题谁回答，不是你的就 next()。

## 测试先立起来，fake agent 带 turn

测试装配参考了 harness 自己的 approval 测试，core/tools 里那个 fake agent 替身，session 带一个 turn/start 就够。

approval.request 有个前提，审计对必须落在开着的 turn 里。

```
turn/start ── … ── approval/asked ── approval/decided ── … ── turn/end
```

turn 是日志的提交边界。裸事件落在两个 turn 之间，重放时和 crash 尾巴无法区分，所以 turn 外询问会在写入任何东西之前直接抛错。

第一次跑挂了两个测试。

一个是卸载方式。ctx.plugin 返回的是 fiber，dispose 在 fiber 上，不在 plugin 的返回值里。探了一下 cordis 源码才改对。

另一个更有意思。我以为 keeper 缺 approval 服务时会 loud fail，实测不是。inject 是激活门控，服务不在时回调根本不激活，plugin() 照样 resolve，静默休眠。这是 cordis 的机制不是 bug，测试改成断言休眠行为，README 里也写清楚。

## 传达室的故事，一层一层剥

keeper 的 Config 就是那份名单，allow、deny、prepend。每次被问到，就按工具名查一遍名单。

```
keeper 被问到，按工具名查名单
   ├─ 在 allow 里 → allowed-once，认领
   ├─ 在 deny 里  → rejected，认领
   └─ 都不在      → next()，委托
```

prepend 是这次最有嚼头的设计点。

patch 加载顺序（先 → 后）

```
dsh-base → dsh-web-app → profile 自身 cordis.patch.yml → --patch overlay
```

waterfall 的回答顺序就是注册顺序。UI 应答者随 web-app 层挂载，先注册，认领一切，所以 --patch 层挂的 keeper 默认排在它后面，自动放行形同虚设。

```
注册顺序（先 → 后）        回答顺序
UI 应答者（web-app 层）  →  先被问到，认领一切
keeper（--patch 层）     →  最后被问到，轮不到
                          prepend: true 时插到最前，抢在 UI 之前
```

prepend: true 是 overlay 唯一能先于 UI 回答的位置。但默认是 false，一个默认就压过真人的自动门，不该是默认。

还有个更硬的边界。'never' 策略在服务层分发前就判了，decide() 里先查 effectivePolicy 再进 waterfall，所以什么 prepend 都绕不过。keeper 是门，策略是锁。

这个层次关系写进 README 的深挖块。user-approval 的源码注释里就讨论过 prepend 监听器绕过 gate 的问题。

会话策略本身也是故事的一部分，读和写分开看。

setApprovalPolicy 是唯一写入口，落一条 approval/policy 事件进会话日志。
日志里最后一条 approval/policy 就是当前策略，重放即恢复。
模型在 runtime-context 快照里能看到当前策略。

测试里切 never 再切回 ask，日志里就有两条 policy 事件，先 never 后 ask，顺序就是历史。

## 十八个用例，一次全绿

进程内装配，SystemPrompt 加 ToolRuntime 加 ApprovalService，fake agent 经 ctx.tools.execute 派发，和 sql_check 那篇同一套姿势。

十八个用例按组看。

keeper 三条决策路径。allow 命中放行，deny 命中拒绝，两边的委托链都不执行。不在名单的，委托给 stub 应答者。

fail-closed 三条。没有应答者、应答者抛错、答了个不认识的词，三种情况都落到 unavailable。

策略两条。never 下任何应答者都不被调用，直接拒绝。切回 ask 后分发恢复。

审计三条。asked 和 decided 同 id，callId 也在。turn 外询问直接抛错。abort 撤回后，迟到的答案作废。

顺序三条。注册序决定谁先答。prepend 可以插队。disposer 卸载后恢复原样。

边界三条。门禁只罩自己的三个工具。没有 approval 服务时，ask 降级成 deny。keeper 缺服务时休眠，根本不激活。

Loader 安全导出一条。

一次全绿。测试钉的是传达室的决策逻辑和链组合，服务自身的行为不重复测，那是 user-approval 自己的测试范围。

## 接下来该干嘛

approval 这半道题收口了，应答者角色练完，剩下的候选从 tea-shop 那篇接着排。

Client 插件还是最大的空缺，浏览器侧那一套，slot、组件、store 纪律，值得单独大探索。units 多 provider 那半道题也在。或者换换口味，回去补生命周期和 effect，把热插拔的清理顺序系统捋一遍。

想碰哪个，都可以从探索开始。
