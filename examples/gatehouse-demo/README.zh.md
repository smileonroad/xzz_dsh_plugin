# gatehouse-demo 实战

[English](README.md) | 中文

老式单位的大门口有间传达室。访客想进去，先登记；传达室大爷翻名单：常客直接放行，通缉名单上的名字当场拒之门外，陌生人就打电话问屋里管东西的人。电话没人接，就进不去。

这就是真实 harness 的 [`approval/request`](../../docs/subsystems/approval.zh.md) **答案者链**——教程里那句「a policy answer instead of the user」。本实战练这条 seam 的第三个角色：答案者。events-demo 练过监听真实 harness 的 `tools/*` waterfall，tea-shop-demo 练过自己声明、自己发出事件；这次同一条 waterfall 纪律（认领或委托）落到真实 harness 事件上，故事和机制一一对应，不靠比喻糊弄。

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

在 web 对话框里让模型开储物柜（`use_locker`）：keeper 的 allow 名单直接放行，工具照常执行。试试金库（`open_vault`）：当场拒绝。再试试实验室（`use_lab`）：不在名单上，web UI 答案者在浏览器里弹窗问真人。

## 设计

### 审批 seam 的三个角色

`approval/request` 只问一件事：这次工具调用能不能放行？三个角色在它上面碰头：

- **Definition**（`dsh-user-approval`，每个 profile 都已挂载）：拥有服务、闭集结果词汇、会话策略和审计对。
- **asker** 是工具执行器：`tools/pre-execute` 监听器返回 `{ kind: 'ask', reason }` 时，dsh-tools 把它转成 `ctx.approval.request`。传达室的 `facilities` 插件就走这条**真实路径**，不另造 ask 工具。
- **answerers** 组成 waterfall 链。web UI 答案者（apiproxy，web-app bundle 的一部分）弹窗问真人；keeper 在它前面或后面加策略答案。

### 故事对照

| 传达室 | approval seam |
|---|---|
| 访客要进去 | `tools/pre-execute` 的 ask → `ctx.approval.request` |
| 大爷翻名单 | `approval/request` 答案者 waterfall |
| 常客 → 直接放行 | 返回 `'allowed-once'`（认领） |
| 通缉名单 → 拒之门外 | 返回 `'rejected'`（认领） |
| 陌生人 → 打电话问人 | 调 `next()` 委托（web 里是 UI answerer） |
| 电话没人接 | 无人应答 → `'unavailable'`（fail closed） |
| 大门锁了 | 会话 `'never'` 策略——服务在**分发前**就判了，谁都轮不到 |

keeper 的 Config 就是那份名单：`allow`（常客）、`deny`（通缉名单）、`prepend`（自动规则放链上哪个位置，见下）。不在名单上的是陌生人，keeper 委托。

### 答案者的纪律：认领或委托

想回答的 waterfall 监听器直接返回结果，链条到此终止。不归自己管的**必须调 `next()`**——events-demo 在 `tools/*` 观察者上钉过的纪律，这次落到真实的决策事件上。记日志的监听器忘调 `next()`，会无声吞掉后面所有答案者。

结果词汇是闭集、fail-closed：

| 结果 | 含义 |
|---|---|
| `'allowed-once'` | 唯一放行——只管这一次动作 |
| `'rejected'` | 拒绝；工具调用带原因失败 |
| `'cancelled'` | 请求被撤回（abort 信号）；迟到的答案直接丢弃 |
| `'unavailable'` | 无答案者、答案者抛错、或非词汇返回值——一律归一化成拒绝 |

答案者抛错，废的是**这单问题**，不是调用方的工具调用：seam 包住自己的回调。

> **深入：谁先答？层序 vs 注册序。**
>
> `ctx.on` 的监听器按注册顺序跑。web UI 答案者**认领一切**审计过的请求——它往浏览器发弹窗然后等——所以注册在它后面的答案者永远轮不到。patch 层序是 dsh-base → dsh-web-app → profile 自身 `cordis.patch.yml` → `--patch` overlay：UI answerer 随 web-app bundle 挂载，`--patch` 挂的 keeper 排在它**后面**，自动放行形同虚设。`prepend: true` 把 keeper 顶到链首——这是 patch overlay 唯一能先于 UI 回答的位置。keeper 默认 `prepend: false`：一个默认就压过真人的自动门，不该是默认。
>
> 但什么 prepend 都绕不过会话策略。`'never'` 在服务层、分发**前**判定，明天再插队的 keeper 也拦不住：**keeper 是门，策略是锁。**

### 会话策略：ask 或 never

`ApprovalPolicy` 是会话级的、可持久化的：`'ask'`（默认）委托给答案者链；`'never'` 确定性拒绝一切请求，连分发都不发生。生效值 = 会话日志里最后一条 `approval/policy` 事件——重放即恢复，不需要追赶机制。`setApprovalPolicy(session, policy)` 是唯一写路径；模型在 runtime-context 快照里能看到当前策略，知道什么时候问了也白问。

### 每次询问都留下审计对

`ctx.approval.request` 先写 `approval/asked`，再写配对的 `approval/decided`，共享同一个 `ApprovalRequestId`——只进日志，不进模型转录。审计对必须被开着的 turn 包住（那是日志的提交边界）；在 turn 外询问，写任何东西之前直接抛错。

## 怎么开发

```
gatehouse-demo/
├── src/gatekeeper.ts    # 答案者：allow/deny/prepend Config，认领或委托
├── src/facilities.ts    # 三个被门禁的工具（use_locker/open_vault/use_lab）+ ask 策略
├── tests/gatehouse-demo.spec.ts  # 18 个用例，进程内，真实 ApprovalService + ToolRuntime
├── cordis.yml           # 组合：approval 服务 + facilities + keeper
└── gatehouse.patch.yml  # web overlay 入口
```

> 关系说明：本目录是审批答案者实战的完整源码 + 测试包；`notes/2026-08-26-gatehouse-demo.md` 记录它背后的学习心得，成形它的提案在 `docs/proposals/2026-08-26-gatehouse-demo.md`。

- `src/gatekeeper.ts` —— `name = 'gatehouse-keeper'`、`inject = ['approval']`（cordis 的激活门控：没有 approval 服务时 keeper 根本不激活）；Schemastery `Config`（同名导出，csv-query-tool 的套路）；监听器按工具名认领 `allow`/`deny`，其余委托。
- `src/facilities.ts` —— `name = 'gatehouse-facilities'`、`inject = ['tools']`。三个玩具工具 + `tools/pre-execute` 的 ask 策略；别的工具一律 `next()` 放行。ask 的 reason 就是访客的故事——web UI 原样拿给真人看。
- `tests/gatehouse-demo.spec.ts` —— 真实 `SystemPrompt` + `ToolRuntime` + `ApprovalService`，fake agent 自带开着的 turn（harness 自己的 approval 测试用同一个替身），经 `ctx.tools.execute` 派发。十八个用例：keeper 三条决策路径、fail-closed（无答案者 / 抛错 / 非词汇返回）、`'never'` 策略与切回、审计对与 turn 前提、abort 取消、注册序 vs prepend、disposer 恢复、门禁边界、无 approval 服务的降级、Loader 安全导出。

跑测试：

```sh
pnpm exec vitest run examples/gatehouse-demo/tests/gatehouse-demo.spec.ts
```

## 怎么分发

与其他实战一致：本目录是**教学示例**，不是可安装包。要分发，按[打包教程](../../docs/user/develop/basic/publish.md)升级成 `packages/` 下的标准 bundle，再用 `dsh plugin --profile <name> add <package>` 安装。
