# events-demo 实战

[English](README.md) | 中文

事件是 dsh 插件之间「喊一嗓子」的方式：一个插件用 `ctx.emit` 发出，谁关心谁用 `ctx.on` 收听。这个实战练**监听侧**——监听真实 harness 事件：`tools/*` 瀑布拦截点（harness 自己用来做工具策略和审计的入口）加 `commands/change` emit 事件。声明并发出自己的事件是下一个实战，[tea-shop-demo](../tea-shop-demo/)。

## 运行

本目录是实战源码的**权威来源**。要运行，先把它拷贝到 deepseek-harness 源码的 `examples/`（那边的副本可能过期），再在 deepseek-harness 根目录操作：

```sh
# 1. 拷贝到 deepseek-harness 源码（本仓库是权威来源）
cp -r examples/events-demo ../deepseek-harness/examples/events-demo

# 2a. 跑测试
cd ../deepseek-harness
pnpm exec vitest run examples/events-demo/tests/events-demo.spec.ts

# 2b. 或挂进 web UI（临时，走 patch 层）
pnpm dsh web --patch examples/events-demo/events.patch.yml
```

> 注意：事件类插件**没有可见 UI**，挂进 web 自己不会显示任何东西——本实战有意义的验证是测试套件（web 发布版 HMR 也默认禁用，改 web 都得重启）。patch 文件的存在是为了在需要时把演示策略挂到运行中的实例上。
>
> 注意：patch 里 entry 的 `name` 是相对**profile 目录**（`~/.dsh/profiles/web/`）解析的，不是相对本文件。`events.patch.yml` 用的是相对路径 + profile 目录下的 junction；首次使用前建一次 junction（Windows，无需管理员权限）：
>
> ```sh
> cmd //c "mklink /J %USERPROFILE%\.dsh\profiles\web\examples <deepseek-harness>\examples"
> ```

## 设计

服务是「我要用你的能力，你先把东西给我」；**事件是「我不知道谁在听，反正我喊一嗓子」**：一个插件用 `ctx.emit` 发出，谁关心谁用 `ctx.on` 收听。harness 自己就跑在事件上——`tools/pre-execute` 是策略在工具执行前放行/拒绝/询问的入口，`tools/post-execute` 是包装器接受/替换/阻断结果的入口（两者都是 **waterfall** 事件：一条中间件链，每个监听器包裹一个 `next()` 调用），`commands/change` 是普通 **emit** 事件，命令注册表一变就触发。本实战监听这些真实事件，不自声明——声明并发出自己的事件是下一个实战，[tea-shop-demo](../tea-shop-demo/)。

两个插件正好是 waterfall 链条允许的两种角色：

```
tools/pre-execute（waterfall，最外层监听器先跑）
    │
    ▼
┌───────────────────────────────┐
│ tool-observer（观察者）        │  必须调 next()——它只记录。
│    │ return next()            │  忘了 next() 会静默绕过后面所有
│    ▼                          │  决策者。
│ tool-policy（决策者）          │  可以不调 next() 直接返回——那就
│    │ 放行？→ next()           │  否决整条链，工具不会跑。
│    │ 拒绝？→ {kind:'deny'}    │
│    ▼                          │
│ 工具本体执行（或被拒绝）        │
└───────────────────────────────┘
```

> **深入：`tools/pre-execute` 监听器能返回什么？**
>
> 决策类型是 `PreToolDecision`：
>
> - `{ kind: 'allow' }` — 放行调用（只有你调了 `next()` 或你就是最外层监听器才有意义；不调 `next()` 就返回它会短路掉后面所有监听器）
> - `{ kind: 'deny', reason }` — 调用结算成携带该原因的错误（`Error: denied by policy`）
> - `{ kind: 'ask', reason? }` — 需要审批渠道；没挂审批时降级为拒绝
>
> `tools/post-execute` 的回答类型是 `PostToolDecision`：`accept`（可选替换结果内容或值）或 `block`（把结果变成带纠正反馈的错误）。这两个类型就是工具拦截点的全部接口——策略或审计插件从不碰工具自己的代码。

这套拆分带出的规则：

- **观察者必须委托。** `tool-observer` 在 `tools/pre-execute` 和 `tools/post-execute` 上都调 `next()`。纪律测试专门注册一个不调 `next()` 就返回 `{ kind: 'allow' }` 的监听器，证明决策者再也轮不到——被封锁的工具照样执行。
- **决策者拥有决定权。** `tool-policy` 对封锁名单上的工具直接返回 `{ kind: 'deny', reason }` 不调 `next()`，被拒的调用结算成错误结果（`Error: denied by policy`）。
- **监听器是 effect。** `ctx.on` 注册的监听器随插件卸载自动消失，返回的 disposer 也可以手动摘除。
- **分发模式。** 真实 harness 事件几乎全是 emit（喊完不管）或 waterfall（中间件链）；serial / bail / parallel 基本只活在 Cordis 内部事件里，所以本实战用小的测试夹具事件来练这三种模式，不假装它们是日常产品事件。

## 怎么开发

```
events-demo/
├── src/tool-observer.ts      # 观察者：tools/pre-execute + post-execute，始终 next()
├── src/tool-policy.ts        # 决策者：tools/pre-execute，拒绝封锁名单
├── tests/events-demo.spec.ts # 10 个用例，真实 ToolRuntime + CommandRuntime
├── cordis.yml                # 组合：observer + policy
└── events.patch.yml          # web overlay 入口
```

> 关系说明：本目录是类型化事件实战的完整源码 + 测试包；`notes/2026-08-23-events-demo.md` 记录它背后的学习心得。成形它的提案在 `docs/proposals/2026-08-22-events-demo.md`。

- `src/tool-policy.ts` — `name = 'events-demo-tool-policy'`、`inject = ['tools']`（等工具注册表就绪），监听 `tools/pre-execute`，对封锁名单上的工具返回 `{ kind: 'deny', reason }` 不调 `next()`；其余一律 `next()` 放行。
- `src/tool-observer.ts` — 观察者对照：监听 `tools/pre-execute` 和 `tools/post-execute`，不产生可见记录、始终委托。它存在的意义是给「正确的观察者」当模板——纪律测试展示观察者忘调 `next()` 会怎样。
- `tests/events-demo.spec.ts` — 挂真实 `SystemPrompt` + `ToolRuntime`（与 sql-check-tool 同一套装配）或 `CommandRuntime`，走真实边界：`ctx.tools.execute()`（agent 循环入口）和 `ctx.commands.register()`。10 个用例覆盖真实 emit 事件、disposer、拒绝/放行、好观察者委托、忘调 next 的纪律、serial / bail / parallel（夹具事件）、Loader 安全导出。

跑测试：

```sh
pnpm exec vitest run examples/events-demo/tests/events-demo.spec.ts
```

## 怎么分发

与其他实战一致：本目录是**教学示例**，不是可安装包。要分发，按[打包教程](../../docs/user/develop/basic/publish.md)升级成 `packages/` 下的标准 bundle，再用 `dsh plugin --profile <name> add <package>` 安装。
