# gatehouse-demo 实战

[English](README.md) | 中文

老式单位的大门口有间传达室。访客想进去，先登记；传达室大爷翻名单：常客直接放行，通缉名单上的名字当场拒之门外，陌生人就打电话问屋里管东西的人。电话没人接，就进不去。

这套流程在 harness 里有一个真实的对应物：`approval/request`。工具想要执行时，harness 会向一群「应答者」征询意见，策略可以代替用户作答（教程原话是 "a policy answer instead of the user"）。前两个实战把事件的监听和声明各练了一遍；这次轮到真实 harness 的 `approval/request`，练的是应答者这个角色。waterfall 的纪律还是那条：要么直接给答案，要么把问题传下去。故事里的每个环节，都能在代码里对上号。

## 运行

本目录是实战源码的**权威来源**。要运行，先把它拷贝到 deepseek-harness 源码的 `examples/`（那边的副本可能过期），再在 deepseek-harness 根目录操作：

```sh
# 1. 拷贝到 deepseek-harness 源码（本仓库是权威来源）
cp -r examples/gatehouse-demo ../deepseek-harness/examples/gatehouse-demo

# 2a. 跑测试
cd ../deepseek-harness
pnpm exec vitest run examples/gatehouse-demo/tests/gatehouse-demo.spec.ts

# 2b. 或挂进 web UI（临时，走 patch 层）
pnpm dsh web --patch examples/gatehouse-demo/gatehouse.patch.yml
```

> 注意：web 的 HMR 在发布版默认禁用，加完插件后必须重启 web 进程。
>
> 注意：patch 里 entry 的 `name` 是相对**profile 目录**（`~/.dsh/profiles/web/`）解析的，不是相对本文件。`gatehouse.patch.yml` 用的是相对路径 + profile 目录下的 junction；首次使用前建一次 junction（Windows，无需管理员权限）：
>
> ```sh
> cmd //c "mklink /J %USERPROFILE%\.dsh\profiles\web\examples <deepseek-harness>\examples"
> ```
>
> 不想用 junction，就改成绝对 `file:///` URL（规则见该文件顶部注释；同盘设 DSH_HOME 相对跳转和 bundle 安装是另外两种做法）。

在 web 对话框里让模型开储物柜（`use_locker`）：keeper 的 allow 名单直接放行，工具照常执行。试试金库（`open_vault`）：当场拒绝。再试试实验室（`use_lab`）：不在名单上，web UI 应答者在浏览器里弹窗问真人。

## 设计

### 审批机制里的三个角色

`approval/request` 从头到尾只问一个问题：这次工具调用，放不放行？三个角色围着这个问题转：

- **定义方**（`dsh-user-approval` 包，每个 profile 都带着）：把整个机制定下来——服务怎么用、结果有哪几种、会话策略是什么、每次询问留下什么记录。
- **问问题的人**：工具执行器。某个 `tools/pre-execute` 监听器说「这个工具要先问一下」，dsh-tools 就把这句话变成一次 `ctx.approval.request`。传达室的 `facilities` 插件用的就是这条现成的路，不自己发明提问方式。
- **回答问题的人**：排成一条 waterfall 链，按注册顺序被问到。web UI 里有一个应答者（apiproxy，随 web-app bundle 挂载），负责弹窗问真人；传达室大爷（keeper）是加在它前面或后面的自动应答者。

整条链走一遍：

```
工具想执行
   │  tools/pre-execute 返回 { kind: 'ask', reason }
   ▼
ctx.approval.request（dsh-tools 的 serviceAsk）
   │  日志先写 approval/asked
   ▼
approval/request waterfall，应答者按注册顺序被问到
   ├─ 返回结果 → 认领，链条终止
   ├─ 调 next() → 传给下一个
   └─ 无人认领 → 默认 unavailable
   ▼
日志补写 approval/decided（同 id），返回 outcome
   ▼
工具执行器：allowed-once 放行，其余拒绝
```

### 故事对照

| 传达室 | approval 机制 |
|---|---|
| 访客要进去 | `tools/pre-execute` 说「要问一下」→ `ctx.approval.request` |
| 大爷翻名单 | `approval/request` 的应答者 waterfall 链 |
| 常客 → 直接放行 | 返回 `'allowed-once'`（认领） |
| 通缉名单 → 拒之门外 | 返回 `'rejected'`（认领） |
| 陌生人 → 打电话问人 | 调 `next()` 委托（web 里是 UI answerer） |
| 电话没人接 | 无人应答 → `'unavailable'`（默认不放行） |
| 大门锁了 | 会话 `'never'` 策略——服务在**分发前**就判了，谁都轮不到 |

keeper 的 Config 就是那份名单：`allow`（常客）、`deny`（通缉名单）、`prepend`（自动规则排在链上哪个位置，见下）。不在名单上的是陌生人，keeper 委托。

### 应答者的纪律：认领或委托

waterfall 的规则很简单：想回答，就直接把结果交回去，链条到此为止；不归你管，**必须调 `next()` 把问题传下去**。events-demo 给 `tools/*` 观察者立过这条规矩，这次它落在真实的决策事件上。只想记日志的监听器如果忘了 `next()`，后面所有应答者都会被无声跳过。

```
应答者被问到
   │
   ├─ 归我管 → 直接返回结果（认领），链条终止
   │
   └─ 不归我管 → 必须调 next() 传下去
                    │
                    └─ 没人认领 → 默认 unavailable
```

答案只有四种，而且默认不放行（fail closed）：

| 结果 | 含义 |
|---|---|
| `'allowed-once'` | 唯一放行——只管这一次动作 |
| `'rejected'` | 明确拒绝，工具调用带着原因失败 |
| `'cancelled'` | 问题被撤回（abort 信号），迟到的答案作废 |
| `'unavailable'` | 没人答、应答者出错、或答了个不认识的词——一律按拒绝处理 |

应答者抛错，坏的只是这一次询问，调用方的工具调用不受牵连：机制把应答者的异常拦在链条内部。

> **深入：应答者按什么顺序被问到？**
>
> 答案者被问到的顺序，就是插件挂载的顺序，而挂载顺序由 patch 层序决定。
>
> ```
> patch 层序（先 → 后）       挂载/回答顺序
> dsh-base
> dsh-web-app               →  UI 应答者先挂载、先注册、先被问到
>    （UI 应答者在这层）
> profile 自身 cordis.patch.yml
> --patch overlay            →  keeper 最后挂载，排在 UI 后面
>    （keeper 在这层）
> ```
>
> UI 应答者来者不拒：先被问到就直接认领，往浏览器发弹窗等着。所以排在它后面的 keeper 永远轮不到，自动放行等于没装。
>
> `prepend: true` 是 `ctx.on` 的注册选项，注册时把监听器插到链的最前面——这是 overlay 唯一能抢在 UI 之前回答的位置。keeper 默认不开 prepend：一个默认就压过真人的自动门，不该是默认。
>
> 但再靠前的 prepend 也绕不过会话策略。`'never'` 在服务里、分发之前就判定了，就算 keeper 插队插到天上去也拦不住：**keeper 是门，策略是锁。**

### 会话策略：ask 或 never

每个会话有一个审批策略，二选一：

- `'ask'`（默认）——把问题交给应答者链
- `'never'` ——一律拒绝，连问都不问

策略写在会话日志里，生效值就是最后一条 `approval/policy` 事件，重放日志就能还原，不需要额外的恢复机制。改策略只有一个入口：`setApprovalPolicy(session, policy)`。模型在每轮的系统提示里能看到当前策略，知道什么时候问了也白问。

### 每次询问都在日志里留一对记录

`ctx.approval.request` 先写一条 `approval/asked`，出结果后再写配对的 `approval/decided`，两条共享同一个 `ApprovalRequestId`——只进日志，不进模型看到的对话。这对记录必须落在一次轮次（turn）内部，轮次是日志的提交边界。在轮次外发起询问，会在写入任何东西之前直接抛错。

## 怎么开发

```
gatehouse-demo/
├── src/gatekeeper.ts    # 应答者：allow/deny/prepend Config，认领或委托
├── src/facilities.ts    # 三个被门禁的工具（use_locker/open_vault/use_lab）+ ask 策略
├── tests/gatehouse-demo.spec.ts  # 18 个用例，进程内，真实 ApprovalService + ToolRuntime
├── cordis.yml           # 组合：approval 服务 + facilities + keeper
└── gatehouse.patch.yml  # web overlay 入口
```

> 关系说明：本目录是审批应答者实战的完整源码 + 测试包；`notes/2026-08-26-gatehouse-demo.md` 记录它背后的学习心得，成形它的提案在 `docs/proposals/2026-08-26-gatehouse-demo.md`。

- `src/gatekeeper.ts` —— `name = 'gatehouse-keeper'`、`inject = ['approval']`。注意 inject 是门控不是报错：没有 approval 服务时 keeper 根本不会激活。Schemastery `Config`（同名导出，csv-query-tool 的套路）；监听器按工具名认领 `allow`/`deny`，其余委托。
- `src/facilities.ts` —— `name = 'gatehouse-facilities'`、`inject = ['tools']`。三个玩具工具 + `tools/pre-execute` 的 ask 策略；别的工具一律 `next()` 放行。ask 的 reason 就是访客的故事——web UI 原样拿给真人看。
- `tests/gatehouse-demo.spec.ts` —— 真实 `SystemPrompt` + `ToolRuntime` + `ApprovalService`，fake agent 自带开着的 turn（harness 自己的 approval 测试用同一个替身），经 `ctx.tools.execute` 派发。十八个用例按组看：
  - keeper 三条决策路径：allow 放行、deny 拒绝（都不惊动后面的应答者）、不在名单则委托
  - 默认不放行三条：没人答、应答者抛错、答了个不认识的词
  - 策略两条：`'never'` 拒绝且任何应答者都不被调用、切回 ask 恢复分发
  - 审计三条：asked/decided 同 id、轮次外询问抛错、abort 撤回且迟到答案作废
  - 顺序三条：注册序决定谁先答、prepend 插队、卸载后恢复原样
  - 边界三条：门禁只罩自己的工具、无 approval 服务时降级成 deny、keeper 缺服务时休眠
  - Loader 安全导出

跑测试：

```sh
pnpm exec vitest run examples/gatehouse-demo/tests/gatehouse-demo.spec.ts
```

## 怎么分发

与其他实战一致：本目录是**教学示例**，不是可安装包。要分发，按[打包教程](../../docs/user/develop/basic/publish.md)升级成 `packages/` 下的标准 bundle，再用 `dsh plugin --profile <name> add <package>` 安装。
