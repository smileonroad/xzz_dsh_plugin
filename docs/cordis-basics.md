# Cordis 基础

> 摘要：Cordis 插件的五个核心概念、事件分发模式、waterfall 语义与 Loader 配置。
> 上游：[`reference/cordis-primer.zh.md`](../reference/cordis-primer.zh.md)（官方入门），实践版见 `reference/cordis-tutorial/`。

## 五个核心概念

1. **插件是实现 Service 的对象。** 带可选 `inject` 和 `apply(ctx)` 字段的函数，或 `Service` 子类；生命周期由 Cordis 挂载到当前上下文。
2. **上下文是服务的容器。** 一个服务占一个稳定 `ctx.<key>`（`ctx.tools`、`ctx.llm`、`ctx.sessions`…）；其他插件按 key 查找服务，**不 import 具体实现**。
3. **`inject` 声明服务依赖。** 依赖就绪才启动插件，加载顺序由依赖表达，不手动排启动序列。
4. **类型化事件通信。** TypeScript 声明合并注册事件名，按分发模式（emit / waterfall / parallel / serial）分发。
5. **注册是可逆副作用。** `ctx.effect()` / `ctx.on()` 安装的东西，reload 和 teardown 自动撤销。

## 事件分发模式

每种事件只有一种分发模式，只能用对应方法分发：

| 模式 | await? | 顺序 | 有返回值? |
|---|---|---|---|
| `emit` | 否 | 按注册顺序观察 | 否 |
| `waterfall` | 否 | 按注册顺序观察 | 是 |
| `parallel` | 是 | 全部并行 | 否 |
| `serial` | 是 | 按注册顺序 | 是 |

## Waterfall：环绕中间件

监听器收 `(...args, next)`。调 `next()` 走下游，下游返回值经 `next()` 回到当前层可包装；**不调 `next()` 直接返回 = 短路**。

- 协作式监听器：改共享对象后委托。
- 单决策事件：短路是设计意图，策略监听器拥有决策权时直接返回；只观察的监听器必须委托。
- 只有必须在普通注册之前运行时才用 `prepend: true`。

## Loader 配置

`@deepseek-ai/cordis-plugin-include` 把 `!!js` 解析为表达式节点；`config` 在注入激活后按插件上下文插值，`disabled` 每次挂载决策时插值。环境选择插件用 overlay。

## 实践规则

- 行为封装成插件：工具流水线事件归 `ctx.tools`，模型流式归 `ctx.llm`，实时 agent 协调归 `ctx.agents`。
- 拦截和策略优先事件，直接能力调用优先服务方法。
- 每个注册都有 disposer；teardown 顺序敏感的工作放同一个 effect。

## 和实战的对应

helloworld-command 用到的就是这个模型的子集：`ctx.commands.register` 注册命令（副作用由插件 fiber 管理）、`inject: ['commands']` 等依赖就绪、`CommandResult` 直接渲染 UI。框架层不烧 token 的分派路径就是这么来的。
