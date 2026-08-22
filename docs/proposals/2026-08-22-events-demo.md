# 提案：events-demo —— 真实 harness 事件与五种分发模式（D 方向 · 选项②）

- 日期：2026-08-22
- 状态：待确认（探索完成，开发前需确认）
- 对应官方指引：cordis-tutorial 04-events（声明/发出/监听、五种分发模式、waterfall 纪律）
- 系列位置：第 5 个实战；承接 units-capability（服务缝）——服务是「要能力」，事件是「喊一嗓子」，两条耦合机制凑齐
- 探索结论：D 方向，用户拍板选项②（真实事件打底 + 测试夹具补模式）；**「自己声明事件」延到下一个实战**

## 选题依据

1. 官方教程顺序：03 服务（units-capability 已练）→ 04 事件，事件是「插件间第二种耦合机制」（CLAUDE.md 核心心智模型）。
2. 教程点名真实用例：`tools/pre-execute` / `tools/execute` / `tools/post-execute` 都是 waterfall；命令注册是 emit。
3. 真实事件库已摸底（38 处 `interface Events`）：emit 类（commands/change、agent-loop/config-start-failed…）和 waterfall 类（tools 三兄弟、approval/request）占绝大多数；serial/bail/parallel 基本只在内部事件使用——所以真实事件练 emit + waterfall，serial/bail/parallel 用测试夹具补全。

## 实战形态（选项②：两个插件，全部监听真实事件）

目录结构：

```
events-demo/
├── src/
│   ├── tool-policy.ts     # 真实 waterfall 决策者：tools/pre-execute 否决（返回 { kind: 'deny', reason }）
│   └── tool-observer.ts   # 真实 waterfall 观察者：tools/pre-execute + post-execute 记录并透传（必须 next()）
├── tests/events-demo.spec.ts   # 含 serial/bail/parallel 的测试夹具事件声明
├── cordis.yml
├── events.patch.yml
└── LICENSE
```

插件角色与教学点：

| 插件 | 角色 | 教学点 |
|---|---|---|
| tool-observer | waterfall **观察者** | 真实事件监听的正确写法：必须调 `next()`；忘调会吞掉所有工具执行（纪律活案例） |
| tool-policy | waterfall **决策者** | 不调 `next()` 即否决，返回 `{ kind: 'deny', reason }`；决策者与观察者的分工 |
| （测试夹具） | — | serial / bail / parallel 三种模式的自有声明 + 驱动（真实 harness 极少用这两类模式，如实说明） |

两个插件都 `inject: ['tools']`，等 ToolRuntime 就绪再挂监听，避免错过早期事件。决策者 vs 观察者的注册顺序语义在 README 讲清（waterfall 最外层先跑）。

测试与验证方式（约 11 用例，真实服务装配）：

- 真实 emit 监听：mount `CommandRuntime`，测试直接 `ctx.on('commands/change')`（真实事件，无需自声明），register/unregister 命令 → 事件触发；`ctx.on` 返回的 disposer 可单独 dispose → 监听消失（自动清理机制）
- 真实 waterfall 观察：mount `SystemPrompt` + `ToolRuntime`（sql-check-tool 已验证挂法）+ 注册真实工具 + `ctx.tools.execute` 驱动
  - tool-observer 透传：挂 observer 后工具正常执行、结果不被改动（好观察者不干扰）
  - 坏观察者吞执行：测试夹具注册一个忘调 `next()` 的监听器（真实事件），工具执行结果被吞（纪律测试）
  - tool-policy 否决：拒绝的工具 body 不跑，结果为 deny 错误
  - tool-policy 放行：允许的工具正常执行
- serial 首个 bail 值短路 / 无 bail 值全部跑完；bail 同步短路；parallel 并发等待全部完成（夹具事件）
- Loader-safe 导出（name / inject 形状）

验证闭环：测试（行为）+ 组合树（cordis.yml / patch 挂载）。事件类插件无 UI，不做 web 端到端（与 units-capability 一致，README 如实说明）。

## 风险与开放问题

1. **scope-filtered dispatch**：tools 瀑布是 scope 过滤分发（`this: Scoped<ToolRuntime>`）。无 agent scope 的根 ctx 上挂监听器能否收到分发，开发期先验证；收不到就参照 harness 自身 tools 测试构造 scoped context。
2. **监听器注册顺序**：tool-policy 与 tool-observer 都监听 pre-execute，waterfall 最外层先跑，注册顺序决定谁先看到；测试显式控制，README 讲清语义。
3. **模式覆盖如实说明**：serial/bail/parallel 在真实 harness 极少用，练习用测试夹具补全——README/笔记里写明，避免读者误以为真实事件都是 emit/waterfall。

## 后续（下一个实战候选）

- **自己声明事件**：stats 式生产方练习——`interface Events` 声明合并 + 服务里 `ctx.emit` 发出自有领域事件 + 消费方监听派生。本实战刻意不含自声明（除测试夹具），把「声明/发出」留到下一个实战完整练。
- units 多 provider 版（另行探索）
- approval/request 自动审批（C 方向，单独大实战候选）

> 说明：探索前遗留的草案文件（src/stats.ts、src/reporter.ts、src/waterfall-demo.ts 等）未进 git，开发阶段按本提案替换为 tool-policy + tool-observer。
