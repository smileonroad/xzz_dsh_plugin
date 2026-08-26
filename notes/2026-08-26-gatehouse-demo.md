# 2026-08-26 — gatehouse-demo，审批的答案者，策略代替用户作答

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

waterfall 事件，答案者返回结果就是认领，调 next() 就是委托。结果词汇是闭集的，allowed-once 是唯一放行，rejected、cancelled、unavailable 全是不放行，unavailable 是 fail-closed，没有答案者、答案者抛错、返回值不在词汇里，统统归一化成 unavailable。

asker 是工具执行器。packages/core/tools/src/index.ts 的 serviceAsk，tools/pre-execute 返回 { kind: 'ask' } 时调 ctx.approval.request，把 outcome 映射回工具的放行或拒绝。所以这次不另造 ask 工具，facilities 插件注册三个被门禁的工具，pre-execute 里对这三个名字返回 ask，走的就是真实路径。tool-bash 的沙箱升级也走这条路，approveEscalation 传的是同一个 approval 服务。

答案者有两个真实的。apiproxy 是 web UI 答案者，认领一切审计过的请求，往浏览器发弹窗然后等用户点。ACP bridge 是机器答案者，只认领自己 agent 的请求，foreign agent 的调 next() 委托。纪律是一样的，谁的问题谁回答，不是你的就 next()。

## 测试先立起来，fake agent 带 turn

测试装配参考了 harness 自己的 approval 测试，core/tools 里那个 fake agent 替身，session 带一个 turn/start 就够。approval.request 有个前提，审计对必须被开着的 turn 包住，turn 外询问直接抛错，这是日志的提交边界，裸事件在 turn 之间追加，重放时和 crash 尾巴无法区分。

第一次跑挂了两个测试。一个是卸载方式，ctx.plugin 返回的是 fiber，dispose 是 fiber 上的方法，不是 plugin 返回的 disposer，写测试的时候先探了一下 cordis 源码才改对。另一个更有意思，我以为 keeper 缺 approval 服务时会 loud fail，实测发现 inject 是激活门控，服务不在时回调根本不激活，plugin() 照样 resolve，静默休眠。这是 cordis 的机制不是 bug，测试改成断言休眠行为，README 里也写清楚。

## 传达室的故事，一层一层剥

keeper 的 Config 就是那份名单，allow、deny、prepend。allow 命中返回 allowed-once，deny 命中返回 rejected，都不在就 next() 委托。prepend 是这次最有嚼头的设计点。

patch 层序是 base、web-app、profile 自身 patch、--patch overlay，web UI 答案者随 web-app bundle 挂载。waterfall 按注册顺序跑，UI answerer 认领一切，所以 --patch 挂的 keeper 默认排在它后面，自动放行形同虚设。prepend: true 把监听器顶到链首，这是 overlay 唯一能先于 UI 回答的位置。但默认是 false，一个默认就压过真人的自动门，不该是默认。

还有个更硬的边界。'never' 策略在服务层分发前就判了，decide() 里先查 effectivePolicy 再进 waterfall，所以什么 prepend 都绕不过。keeper 是门，策略是锁。这个层次关系写进 README 的深挖块，从源码注释里读出来的，user-approval 自己就讨论过 prepend 监听器绕过 gate 的问题。

会话策略本身也是故事的一部分。approval/policy 事件写进会话日志，重放就是状态，setApprovalPolicy 是唯一写路径，模型在 runtime-context 快照里能看到当前策略。测试里切 never 再切回 ask，日志里两条 policy 事件，顺序就是历史。

## 十八个用例，一次全绿

进程内装配，SystemPrompt 加 ToolRuntime 加 ApprovalService，fake agent 经 ctx.tools.execute 派发，和 sql_check 那篇同一套姿势。

十八个用例。keeper 三条决策路径，allow 放行且委托链不执行，deny 拒绝且委托链不执行，不在名单委托给 stub 答案者。fail-closed 三条，无答案者 unavailable，答案者抛错 unavailable，非词汇返回归一化 unavailable。策略两条，never 拒绝且任何答案者都不被调用，切回 ask 恢复分发。审计对一条，asked 和 decided 同 id，callId 也在。turn 前提一条。abort 一条，迟到答案丢弃。注册序和 prepend 两条。disposer 恢复一条。门禁边界一条，别的工具直接放行不触发 ask。无 approval 服务的降级一条。Loader 安全导出一条。

一次全绿。测试钉的是传达室的决策逻辑和链组合，服务自身的行为不重复测，那是 user-approval 自己的测试范围。

## 接下来该干嘛

approval 这半道题收口了，答案者角色练完，剩下的候选从 tea-shop 那篇接着排。

Client 插件还是最大的空缺，浏览器侧那一套，slot、组件、store 纪律，值得单独大探索。units 多 provider 那半道题也在。或者换换口味，回去补生命周期和 effect，把热插拔的清理顺序系统捋一遍。

想碰哪个，都可以从探索开始。
