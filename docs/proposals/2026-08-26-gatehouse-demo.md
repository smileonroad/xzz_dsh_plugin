# 提案：gatehouse-demo —— 传达室（审批的答案者）

- 日期：2026-08-26
- 状态：待确认（探索完成，开发前需确认）
- 对应官方指引：[`docs/subsystems/approval.md`](../reference/subsystems/approval.zh.md) + cordis-tutorial 04-events（教程点名句：「`approval/request` lets a policy answer instead of the user」）+ `packages/interaction/user-approval` 源码
- 系列位置：第 7 个实战；承接 events-demo / tea-shop-demo 的事件话题——前两个实战用自声明事件练 waterfall 的观察者/决策者纪律，本实战把同一套纪律用到**真实 harness 的 `approval/request` 上**，练 seam 的第三个角色：答案者
- 探索结论：方向「approval/request 自动审批」按 events-demo 笔记排期（「教程点名过……值得单独一个大实战」）；领域用**传达室**（方案见下）——一看就是 sample，不撞真货，故事和机制一一对应

## 选题依据

1. events-demo 笔记明确排期，tea-shop 笔记的「接下来该干嘛」再次确认候选。
2. 领域 = 老式单位传达室，符合「第一眼测试」（tea-shop 笔记立的规矩：教学样本的名字第一眼要让人知道这是玩具）。门禁/传达室和 approval/request 的机制天然一一对应，不需要像报销金额那样把领域数据硬塞进 reason：

| 传达室故事 | approval seam |
|---|---|
| 访客要进院/拿东西 | `ctx.approval.request`（asker） |
| 传达室大爷先看名单 | `approval/request` waterfall 的答案者链 |
| 常客（allow 名单）→ 直接放行 | 返回 `'allowed-once'`（认领） |
| 通缉名单（deny 名单）→ 拒之门外 | 返回 `'rejected'`（认领） |
| 陌生人 → 打电话问屋里的人 | 调 `next()` 委托（web 里是 UI answerer） |
| 电话没人接 | 无人应答 → `'unavailable'`（fail closed） |
| 大爷不在，只有自动规则 | prepend 的故事：自动规则放第一道门还是最后一道 |

3. 已摸底真实 seam（探索摘要见下）：Definition、asker、两个真实 answerer 的纪律可提炼为「认领（返回 outcome）或委托（next()），谁的问题谁回答」。
4. 挂载顺序是真实约束，也是教学金矿：patch 层序（base → web-app → profile 自身 patch → `--patch` overlay）让 overlay 挂的答案者排在 UI answerer **之后**；`ctx.on` 的 `prepend` 选项是文档化的插队机制（user-approval 源码注释明确讨论过 prepend 与 `'never'` 策略的关系）。而 `'never'` 策略在服务层、分发**前**判定，prepend 也绕不过——「策略的层次」正好借传达室讲：传达室大爷再厉害，也拦不住锁门的决定。

## 探索摘要（关键事实）

- `ApprovalOutcome`：`'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'`，闭集、fail-closed；`allowed-once` 是唯一放行。
- `ctx.approval.request(req)`：要求**开着的 turn**（审计对必须被 turn 包住）；先 append `approval/asked`，分发 waterfall，再 append `approval/decided`；无答案者 → `'unavailable'`；答案者 throw → `'unavailable'`；非词汇返回值 → 规范化为 `'unavailable'`。
- waterfall 分发是 scope-filtered（`scopeTarget(agent)`）；答案者自行决定认领/委托。
- 会话策略：`approval/policy` 会话事件（log-only、可重放 fold）；`'never'` 分发前确定性拒绝；`setPolicy` 是唯一写路径；策略文本进 runtime-context 快照（系统提示词 order 115）。
- 真实 asker 路径：dsh-tools 的 `serviceAsk`（`tools/pre-execute` 返回 `{ kind: 'ask' }` 时走 `ctx.approval.request`）——本实战**就走这条路**，不另造 asker 工具。
- 测试装配样板：core/tools 测试的 fakeAgent 模式（`{ session: { events, append } }`，带 `turn/start`）+ 真实 ToolRuntime + 真实 ApprovalService；`acp/approval.spec` 同款 turn 前提。
- 工具名 `use_locker` / `open_vault` / `use_lab` 全仓库无冲突（待实现前再 grep 确认）。

## 实战形态

```
examples/gatehouse-demo/
├── src/
│   ├── gatekeeper.ts      # 答案者（传达室大爷 + 自动规则）
│   └── facilities.ts      # 三个被门禁的工具 + ask 策略（asker 角色）
├── tests/gatehouse-demo.spec.ts
├── cordis.yml
├── gatehouse.patch.yml
└── LICENSE
```

| 插件 | 角色 | 教学点 |
|---|---|---|
| `gatehouse-keeper` | 答案者 | Config `{ allow: string[], deny: string[], prepend: boolean }`（Schemastery，csv-query 套路）；`allow` 命中 → `'allowed-once'`，`deny` 命中 → `'rejected'`，其余 `next()` 委托；`prepend: true` 时注册到链首（自动规则放第一道门）；`inject: ['approval']` |
| `gatehouse-facilities` | 被门禁的工具 + asker | 三个工具 `use_locker`（储物柜）/ `open_vault`（金库）/ `use_lab`（实验室），execute 是玩具级 stub；`tools/pre-execute` 监听器对这三个名字返回 `{ kind: 'ask', reason }`——走 dsh-tools 的真实 `serviceAsk` 路径，不另造 ask 工具；`inject: ['tools']` |

故事默认名单（cordis.yml / patch 里配）：`allow: ['use_locker']`（常客直接开柜），`deny: ['open_vault']`（金库一律拒），`use_lab` 不在名单 → 转人工（web 里 UI answerer 弹窗，测试里 stub 扮演屋里的人）。

测试与验证方式（约 14 用例，进程内、零外部依赖，真实 ApprovalService + 真实 ToolRuntime）：

- 传达室决策：`use_locker`（allow）→ `'allowed-once'` 且委托链未执行，工具结果成功；`open_vault`（deny）→ `'rejected'` 且委托链未执行，工具结果 isError（rejected 原因可见）；`use_lab`（不在名单）→ 委托 stub，stub 的答案生效
- fail-closed：无答案者 → `'unavailable'`；答案者 throw → `'unavailable'`；非词汇返回值 → 规范化为 `'unavailable'`
- 会话策略：`'never'` → `'rejected'` 且 keeper 不被调用（allow 命中也不行）；`setPolicy('ask')` 恢复分发；`approval/policy` 事件进日志
- 审计对：`approval/asked` + `approval/decided` 同 id；turn 未开 → `ctx.approval.request` 抛错（直连断言）
- abort → `'cancelled'`，迟到答案被丢弃
- 顺序与 prepend：stub 先注册 → keeper 后注册默认排后面（stub 赢）；`prepend: true` 的 keeper 后注册仍先答；disposer 卸载 keeper 后委托链恢复
- Loader 安全导出（name / inject 形状）

验证闭环：测试（行为）+ 组合树（cordis.yml / patch 挂载）+ 可选 web 真实轮次（模型调 `use_locker`，需要 `DEEPSEEK_API_KEY`，自跳过）。

## 风险与开放问题

1. **prepend 默认值**：web 组合里 UI answerer（apiproxy，web-app bundle 层）认领一切审计过的请求，`--patch` 挂的 keeper 默认排在它后面 → 自动放行默认无效。`prepend: true` 才把自动规则放第一道门。倾向**默认 `false`**（安全），README 讲清层序与插队机制，web 挂载示例用 `prepend: true`。
2. **ask 的粒度**：`approval/request` 只带 toolName（不带你工具的 args——服务刻意如此，UI 靠 callId 挂到已流式的调用上），所以传达室只能按「操作」放行，不能按「哪个储物柜」。README 要把这个边界讲成故事的一部分：传达室大爷只看你干什么，不看细节。
3. **web e2e 可选**：真实轮次验证依赖 key，进程内套件是行为门槛（与 sql-check-tool 的验证闭环一致）。
4. **测试装配最小栈**：SystemPrompt + ToolRuntime + ApprovalService + fakeAgent，实现时钉死；不引入 SessionStore / AgentRegistry（core/tools 测试证明 fakeAgent 够用）。

## 否决项（探索阶段明确不做）

- 不改 harness 源码：user-approval / apiproxy / tools 零改动，纯消费方示例
- 不做沙箱升级链路（tool-bash + 沙箱 executor，重，是另一个实战）
- 不做 scope 过滤的 agent 专属答案者（`this: Scoped<…>` 的用法，后续候选）
- 不新增 `ApprovalPolicy` 取值（只有 ask/never，那是 Definition 的边界）
- 不重复 user-approval 自身测试已覆盖的服务行为——测试钉的是**传达室的决策逻辑 + 链组合**，服务行为只做契约证明
