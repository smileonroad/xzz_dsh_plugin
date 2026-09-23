# 第 7 章：进入 harness

> [← 总览](README.md) · 上一章：[第 6 章：组合与 HMR](06-组合与-HMR.md) · 下一章：[第 8 章：工具编写参考](08-工具编写参考.md)

> **路径约定**。下文 **📄 文件** 给的是**本仓库**里的源码位置，都在 [`01-learn-basics/examples/cordis-tutorial/`](../../examples/cordis-tutorial/) 下；**▶️ 运行** 给的是**拷进 deepseek-harness 之后**在该检出目录里敲的命令，同步方式见[总览的通用运行方式](README.md#通用运行方式)。

## 7.0 本章一句话

> 前六章把 cordis 框架本身拆完了。这一章把它们拼起来，**第一次挂上真实的 harness 业务服务** —— `tools`：注册一个可由模型调用的工具，用真实执行流水线跑一次调用，再用事件观察结果。本章几乎没有新的框架知识，它是前六章的**实弹演习**。

| 前几章的模式 | 在本章的出场位置 |
|---|---|
| 第 1 章：插件三件套 `name` / `inject` / `apply` | `greet-tool.ts` 的完整形态 |
| [第 2 章：effect disposer](02-生命周期与-effect.md#22-effect--做一件事附赠一个撤销按钮) | `tools.register()` 的返回值就是它 → 插件卸载自动注销工具 |
| [第 3 章：inject 门控与 PENDING](03-服务.md#34--实验pending-是静默的) | 依赖链 `systemPrompt` ← `tools` ← 你的工具插件 |
| [第 4 章：事件与声明合并](04-事件.md#42-声明发出监听) | `tools/result`、`tools/change`；`import type {} from '@deepseek-ai/dsh-tools'` |
| [第 5 章：类插件与指针规则](05-配置.md#54--核心config-挂在哪指针规则) | dsh-tools 包本身就是 `export default ToolRuntime`（`static inject` / `static Config`） |
| [第 6 章：诊断与静默退出](06-组合与-HMR.md#61-条目的元数据) | 缺 `systemPrompt` → 全链 PENDING → 进程退出码 0 |

本章用到 4 个真实的 harness 包（都在 `packages/` 下，经 `tsconfig.base.json` 的 paths 解析）：

| 包 | 提供什么 |
|---|---|
| `@deepseek-ai/dsh-tools` | `tools` 服务（`ToolRuntime` 类）+ `defineTool` 纯函数 |
| `@deepseek-ai/dsh-system-prompt` | `systemPrompt` 服务（`tools` 依赖它） |
| `@deepseek-ai/dsh-brand` | `brandString` —— 编译期品牌标记 |
| `@deepseek-ai/dsh-llm` | `ToolCallId` 类型（re-export 自其 `brand.ts`） |

---

## 7.1 注册一个模型可调用的工具

主角是 `tools` 服务：注册一句话 `ctx.tools.register(defineTool({...}))`，执行一句话 `ctx.tools.execute({...})`。`defineTool` 做三件事：

1. 把 `parameters` 的**简写规约**转成给模型看的 **JSON Schema**（[7.3](#73-definetool-是纯函数模型看到的-json-schema)）；
2. 给 `execute` 的 `args` **推导类型**；
3. 在 `execute` 运行前**校验**模型给的参数（[7.4](#74-校验发生在-execute-之前)）。

工具的返回是**双通道**的：`output.schema` 声明规范值（canonical value，`execute` 返回它）；`output.render` 把规范值渲染成可持久化的内容块（`ContentBlock[]`，模型和日志看到的是这个）。

`cordis.yml` 要列 **4 个条目** —— 多出来的 `@deepseek-ai/dsh-system-prompt` 是因为 `dsh-tools` 注入了 `systemPrompt` 服务：工具要把自己的 schema 贡献进系统提示词（源码见下）。缺了它整条链 PENDING（[7.7](#77-缺了-systemprompt整条链-pending)）。

### 🧪 实验：跑通真实流水线

**📄 文件** `01-learn-basics/examples/cordis-tutorial/07-greet-tool/greet-tool.ts`

```ts
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet the named person.',
    parameters: {
      name: { type: 'string', required: true, description: 'Who to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))

  // Drive one call through the real execution pipeline, standing in for
  // the model. ToolCallId brands the correlation id a provider would issue.
  void (async () => {
    const result = await ctx.tools.execute({
      callId: brandString<ToolCallId>('demo-1'),
      name: 'greet',
      arguments: { name: 'Cordis' },
      signal: new AbortController().signal,
    })
    console.log('tool replied:', JSON.stringify(result.content))
  })()
}
```

**📄 文件** `01-learn-basics/examples/cordis-tutorial/07-greet-tool/tool-logger.ts`

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'tool-logger'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    const text = result.content
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('')
    console.log(`[tool-logger] ${exec.name} -> ${text}`)
  })
}
```

**📄 文件** `01-learn-basics/examples/cordis-tutorial/07-greet-tool/cordis.yml`

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
- name: '@deepseek-ai/dsh-tools'
- name: './tool-logger.ts'
- name: './greet-tool.ts'
```

**▶️ 运行**

```sh
cd tmp/cordis-tutorial/07-greet-tool
node --import tsx ../../../vendor/cordis/bin.js
```

**输出**

```
[tool-logger] greet -> Hello, Cordis!
tool replied: [{"type":"text","text":"Hello, Cordis!"}]
```

退出码 `0`。与教程给出的预期输出**逐字一致**。

两个插件**互不知道对方存在** —— `greet-tool` 只管注册和调用，`tool-logger` 只管监听事件，它们通过 `tools` 这个注册表服务 + `tools/result` 事件连接。这正是第 3、4 章「服务 + 事件 = 解耦」的实战形态。

### 源码印证

| 位置 | 内容 |
|---|---|
| `packages/core/tools/src/index.ts:780-781` | `export class ToolRuntime extends Service`，`static inject = ['systemPrompt']` |
| `packages/core/tools/src/index.ts:820` | `super(ctx, 'tools')` → 服务名就是 `tools` |
| `packages/core/tools/src/index.ts:825` | 构造函数里 `ctx.systemPrompt.tools(context => this.wireSchemas(context.scope))` —— **这就是它依赖 systemPrompt 的原因**：把工具 schema 接进系统提示词 |
| `packages/core/tools/src/index.ts:783-786` | `static Config`：`mode`（`native`/`ptc`/`both`，默认 `native`）、`maxParallelSubCalls`（默认 10） |
| `packages/core/tools/src/index.ts:1936` | `export default ToolRuntime` |
| `packages/core/system-prompt/src/index.ts:416` | `super(ctx, 'systemPrompt')`，且**没有 inject** —— 它是这条依赖链的根 |

注意最后两行合起来的含义：dsh-tools 这个包**本身就是第 5 章的类插件形态** —— `export default` 一个 Service 子类，`static inject`、`static Config` 都挂在指针对象（类）上。第 5 章的四组对照实验，在这里成了生产代码。

---

## 7.2 为什么 logger 先于 `execute` 返回打印

上面的输出里 `[tool-logger]` 在 `tool replied:` **之前**。这不是巧合，是结构：`execute` 的所有终结路径都汇到 `finishScheduledExecution`（`index.ts:1342、1347、1602、1609` 四处调用），而它**先发事件、后返回**：

```ts
// packages/core/tools/src/index.ts:1621-1636（节选）
private finishScheduledExecution(exec, result) {
  // ...materialize + finalizeContent...
  this.notifyResult(exec, finalResult)   // ← 发 tools/result
  return finalResult                      // ← 然后才返回给 execute 的调用方
}
```

`notifyResult`（`index.ts:1647-1666`）还有三个细节：

1. **`Object.freeze(exec)`** —— 观察者拿到的执行对象已冻结，改不动；
2. 用 **`emit` 模式**分发（第 4 章五种模式的第一种），且带 `scopeTarget(this, exec.agent)` —— agent 作用域的监听者只收到自己 agent 的调用；
3. **观察者抛错只 `logger.warn`，绝不打断流水线**（`index.ts:1652-1664`）—— 一个坏掉的 logger 不能弄坏工具执行。

结论：`tools/result` 是**通知**，不是**钩子** —— 它无法改变结果。想拦截或改写结果，用的是 `tools/pre-execute` / `tools/post-execute` 这两个 **waterfall** 事件（`index.ts:144、167`）—— 已在[第 8 章 §8.2](08-工具编写参考.md#82-执行策略与观测五个扩展点全景) 实测（deny、guard、content 替换、block 全部有真实输出）。

---

## 7.3 defineTool 是纯函数：模型看到的 JSON Schema

`defineTool` **不需要任何服务在场** —— 它只是个转换函数（`packages/core/tools/src/schema.ts:545-617`）。所以这个实验的 `cordis.yml` 只有一行，连 dsh-tools 服务条目都不用挂：

**📄 文件** `01-learn-basics/examples/cordis-tutorial/07-schema/show-schema.ts`

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'show-schema'
// 注意：没有 inject —— defineTool 是纯函数，不需要 tools 服务在场

export function apply(_ctx: Context) {
  const tool = defineTool({
    name: 'greet',
    description: 'Greet the named person.',
    parameters: {
      name: { type: 'string', required: true, description: 'Who to greet' },
      age: { type: 'integer', description: 'Optional age' },
      lang: { type: 'string', enum: ['zh', 'en'], description: 'Language' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  })

  console.log('parameters —— 交给模型的 JSON Schema:')
  console.log(JSON.stringify(tool.parameters, null, 2))
  console.log('output.schema:')
  console.log(JSON.stringify(tool.output.schema))
}
```

**📄 文件** `01-learn-basics/examples/cordis-tutorial/07-schema/cordis.yml`

```yaml
- name: './show-schema.ts'
```

**▶️ 运行**

```sh
cd tmp/cordis-tutorial/07-schema
node --import tsx ../../../vendor/cordis/bin.js
```

**输出**

```
parameters —— 交给模型的 JSON Schema:
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Who to greet"
    },
    "age": {
      "type": "integer",
      "description": "Optional age"
    },
    "lang": {
      "type": "string",
      "description": "Language",
      "enum": [
        "zh",
        "en"
      ]
    }
  },
  "required": [
    "name"
  ]
}
output.schema:
{"type":"string"}
```

退出码 `0`。

**三个观察**：

1. 每个属性上的 `required: true` 被**提升**成了根对象的 `required: ["name"]` 数组 —— 简写规约 → 标准 JSON Schema；
2. `description`、`enum` 原样保留 —— 这些就是模型在工具清单里看到的内容；
3. 转换点在 `schema.ts:566`：`parameterSchemaSpecToJsonSchema(options.parameters)`；`output.schema` 同样经过 `valueSchemaSpecToJsonSchema`（`schema.ts:567`）。

支持的属性类型（`schema.ts:85-94`）：`string` / `number` / `integer` / `boolean` / `null` / `array` / `object` / `json`（无约束）/ `oneOf`（至少两个分支）。每个属性还可带 `required`、`enum`、`const`、`description`、`examples` 注解（`schema.ts:14-21、97`）。

---

## 7.4 校验发生在 execute 之前

教程说 `defineTool` 「在 `execute` 运行前校验模型提供的参数」。验证方法：给 `execute` 体加一行打印当**存活探针**，然后传两种非法参数 —— 类型错的和缺必填字段的：

**📄 文件** `01-learn-basics/examples/cordis-tutorial/07-args-invalid/greet-tool-invalid.ts`

```ts
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'

export const name = 'greet-tool-invalid'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet the named person.',
    parameters: {
      name: { type: 'string', required: true, description: 'Who to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      console.log('   [execute body] 如果这行打印了，说明校验没拦住')
      return `Hello, ${args.name}!`
    },
  }))

  void (async () => {
    const signal = new AbortController().signal

    // ① 类型错误：name 声明为 string，传数字 42
    const wrongType = await ctx.tools.execute({
      callId: brandString<ToolCallId>('bad-1'),
      name: 'greet',
      arguments: { name: 42 },
      signal,
    })
    console.log('① 类型错误 isError:', wrongType.isError)
    console.log('① 类型错误 content:', JSON.stringify(wrongType.content))

    // ② 缺少必填字段：name 是 required
    const missing = await ctx.tools.execute({
      callId: brandString<ToolCallId>('bad-2'),
      name: 'greet',
      arguments: {},
      signal,
    })
    console.log('② 缺字段 content:', JSON.stringify(missing.content))
  })()
}
```

**📄 文件** `01-learn-basics/examples/cordis-tutorial/07-args-invalid/tool-logger.ts`（这个版本把 `isError` 也打出来）

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'tool-logger'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    const text = result.content
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('')
    console.log(`[tool-logger] ${exec.name} (isError=${result.isError}) -> ${text}`)
  })
}
```

**📄 文件** `01-learn-basics/examples/cordis-tutorial/07-args-invalid/cordis.yml`

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
- name: '@deepseek-ai/dsh-tools'
- name: './tool-logger.ts'
- name: './greet-tool-invalid.ts'
```

**▶️ 运行**

```sh
cd tmp/cordis-tutorial/07-args-invalid
node --import tsx ../../../vendor/cordis/bin.js
```

**输出**

```
[tool-logger] greet (isError=true) -> Error: invalid arguments: "name" must be a string
① 类型错误 isError: true
① 类型错误 content: [{"type":"text","text":"Error: invalid arguments: \"name\" must be a string"}]
[tool-logger] greet (isError=true) -> Error: invalid arguments: missing required property "name"
② 缺字段 content: [{"type":"text","text":"Error: invalid arguments: missing required property \"name\""}]
```

退出码 `0`。

**三个观察**：

1. **`[execute body]` 一次都没打印** —— 校验拦在了用户代码之前；
2. 调用方拿到的不是异常，是**规范化的错误结果**：`isError: true` + `Error: ...` 文本内容 —— 工具失败不会炸掉调用方（这里是模拟模型的我们，真实场景是 agent loop）；
3. **失败的调用照样发 `tools/result`**（logger 两行都打了，`isError=true`）—— 观察者看到所有终态，成功和失败一视同仁。

### 源码印证

| 位置 | 内容 |
|---|---|
| `packages/core/tools/src/schema.ts:585-589` | `defineTool` 包装后的 `execute`：先 `validate(args)`，有违规直接 `throw new ToolArgsError(violations)`，用户 `execute` 根本不被触碰 |
| `packages/core/tools/src/schema.ts:461-470` | `ToolArgsError`：message = `invalid arguments: <violations 用 ; 连接>`，code = `INVALID_ARGS` |
| `packages/core/tools/src/index.ts:1860-1869` | `toolErrorResult`：任何错误统一规范化为 `{ content: [{type:'text', text:'Error: ...'}], isError: true, error: {message, info?} }` |
| `packages/core/tools/src/index.ts:1608-1610` | dispatch 阶段的 `catch` 把抛错（包括工具体自己抛的）转成错误结果 —— 所以「失败」对流水线来说也是正常终态 |

---

## 7.5 register 返回 disposer：注销与 tools/change

教程说 `ctx.tools.register(...)` 「会把注册 disposer 附着到插件（第 2 章），因此卸载时会注销工具」。验证：接住返回值，手动调一次，看工具还在不在；顺带监听 `tools/change` 事件：

**📄 文件** `01-learn-basics/examples/cordis-tutorial/07-unregister/unregister-demo.ts`

```ts
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'

export const name = 'unregister-demo'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.on('tools/change', () => {
    console.log('[tools/change] 可用工具集变了')
  })

  // register 返回 disposer —— 第 2 章的 ctx.effect 契约
  const dispose = ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet the named person.',
    parameters: {
      name: { type: 'string', required: true, description: 'Who to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))

  void (async () => {
    const signal = new AbortController().signal

    const before = await ctx.tools.execute({
      callId: brandString<ToolCallId>('c1'),
      name: 'greet',
      arguments: { name: 'Before' },
      signal,
    })
    console.log('注销前:', JSON.stringify(before.content))

    console.log('--- 调用 disposer ---')
    dispose()

    const after = await ctx.tools.execute({
      callId: brandString<ToolCallId>('c2'),
      name: 'greet',
      arguments: { name: 'After' },
      signal,
    })
    console.log('注销后 isError:', after.isError)
    console.log('注销后:', JSON.stringify(after.content))
  })()
}
```

**📄 文件** `01-learn-basics/examples/cordis-tutorial/07-unregister/cordis.yml`

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
- name: '@deepseek-ai/dsh-tools'
- name: './unregister-demo.ts'
```

**▶️ 运行**

```sh
cd tmp/cordis-tutorial/07-unregister
node --import tsx ../../../vendor/cordis/bin.js
```

**输出**

```
[tools/change] 可用工具集变了
注销前: [{"type":"text","text":"Hello, Before!"}]
--- 调用 disposer ---
[tools/change] 可用工具集变了
注销后 isError: true
注销后: [{"type":"text","text":"Error: unknown tool \"greet\""}]
```

退出码 `0`。

**观察**：注册和注销**各触发一次 `tools/change`**（可用工具集变化的广播，模型下一轮看到的工具清单要重新组装了）；注销后再调用得到 `UNKNOWN_TOOL` 错误结果 —— 工具真的没了。

### 源码印证：disposer 就是 ctx.effect 的 disposer

```
tools.register(definition)                       // index.ts:1027
  └─ this.layers.effect(this.ctx, insert, ...)   // index.ts:1047-1051
       └─ ctx.effect(function* () { ... })       // packages/core/scope/src/store.ts:233
```

`ScopedLayers.effect` 的 docstring 写得明白：「@returns the exact disposer returned by `ctx.effect()`」（`store.ts:224`）。所以第 2 章的契约**原样成立**：这个 disposer 附着在插件的 fiber 上，插件卸载（fiber 回卷）时自动被调 —— **不接返回值也不会泄漏**，接住只是为了能「提前手动注销」。

`tools/change` 的发出点：`ScopedLayers` 构造时传入的 notify 回调 `() => { this.ctx.emit('tools/change') }`（`index.ts:804-807`）。

`register` 本身还有三道闸（`index.ts:1027-1046`，源码可见但本章未实测）：`output` 缺 `render` → `TypeError`；`timeoutMs` 非正数 → `TypeError`；名字 `run_code` → 保留名，直接拒绝。

---

## 7.6 `signal`：必填的取消句柄

教程里每个 `execute` 调用都带着 `signal: new AbortController().signal` —— 创建一个 controller 又当场扔掉，看起来像废代码。其实：

- `signal` 是 `ToolExecutionInput` 的**必填**字段（`packages/core/tools/src/index.ts:329-330`：“Required caller-owned cancellation for this invocation”），必须给一个；
- `new AbortController().signal` 是一个**不可取消的占位符**：controller 引用被丢弃，没有任何人能对它 `.abort()`，signal 永远 `aborted === false`；
- 真实场景里，这个 controller 由 **agent loop** 持有 —— 用户按停止、会话被打断时，`abort()` 顺着 signal 传进正在跑的工具。

那真的 abort 了会怎样？取消是**协作式**的，不是杀戮式的。实测三种情形：

### 🧪 实验：中途取消 / 预先取消 / 不可取消

**📄 文件** `01-learn-basics/examples/cordis-tutorial/07-abort/abort-demo.ts`

```ts
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'

export const name = 'abort-demo'
export const inject = ['tools']

// 故意【不监听】signal 的 sleep —— 演示「body 无视取消」时流水线怎么办
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'slow',
    description: 'Sleep for the given milliseconds, then report.',
    parameters: {
      ms: { type: 'integer', required: true, description: 'How long to sleep' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      console.log(`   [body] 开始睡 ${args.ms}ms，此刻 exec.signal.aborted =`, exec.signal.aborted)
      await sleep(args.ms)
      console.log('   [body] 自然睡醒，此刻 exec.signal.aborted =', exec.signal.aborted, '→ 照常返回成功值')
      return `slept ${args.ms}ms`
    },
  }))

  void (async () => {
    // ① 中途取消：body 要睡 400ms，调用方 100ms 时 abort()
    const c1 = new AbortController()
    const p1 = ctx.tools.execute({
      callId: brandString<ToolCallId>('a1'),
      name: 'slow',
      arguments: { ms: 400 },
      signal: c1.signal,
    })
    setTimeout(() => {
      console.log('--- 调用方：abort()（此刻 body 还在睡）---')
      c1.abort()
    }, 100)
    const r1 = await p1
    console.log('① 中途取消 isError:', r1.isError, '| code:', r1.error?.info?.code)
    console.log('① content:', JSON.stringify(r1.content))

    // ② 出发前已取消：signal 在 execute 调用前就是 aborted
    const c2 = new AbortController()
    c2.abort()
    const r2 = await ctx.tools.execute({
      callId: brandString<ToolCallId>('a2'),
      name: 'slow',
      arguments: { ms: 400 },
      signal: c2.signal,
    })
    console.log('② 预先取消 isError:', r2.isError, '| code:', r2.error?.info?.code, '（注意上面没有 [body] 打印）')

    // ③ 对照：教程的写法 —— controller 当场丢弃，永远不会有人 abort
    const r3 = await ctx.tools.execute({
      callId: brandString<ToolCallId>('a3'),
      name: 'slow',
      arguments: { ms: 50 },
      signal: new AbortController().signal,
    })
    console.log('③ 不可取消 signal:', JSON.stringify(r3.content), '| isError:', r3.isError)
  })()
}
```

**📄 文件** `01-learn-basics/examples/cordis-tutorial/07-abort/tool-logger.ts` —— 与 [`07-args-invalid`](#74-校验发生在-execute-之前) 的带 `isError` 版本相同。

**📄 文件** `01-learn-basics/examples/cordis-tutorial/07-abort/cordis.yml`

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
- name: '@deepseek-ai/dsh-tools'
- name: './tool-logger.ts'
- name: './abort-demo.ts'
```

**▶️ 运行**

```sh
cd tmp/cordis-tutorial/07-abort
node --import tsx ../../../vendor/cordis/bin.js
```

**输出**

```
   [body] 开始睡 400ms，此刻 exec.signal.aborted = false
--- 调用方：abort()（此刻 body 还在睡）---
   [body] 自然睡醒，此刻 exec.signal.aborted = true → 照常返回成功值
[tool-logger] slow (isError=true) -> Error: tool call aborted
① 中途取消 isError: true | code: ABORTED
① content: [{"type":"text","text":"Error: tool call aborted"}]
[tool-logger] slow (isError=true) -> Error: tool call aborted before dispatch
② 预先取消 isError: true | code: ABORTED_BEFORE_DISPATCH （注意上面没有 [body] 打印）
   [body] 开始睡 50ms，此刻 exec.signal.aborted = false
   [body] 自然睡醒，此刻 exec.signal.aborted = false → 照常返回成功值
[tool-logger] slow (isError=false) -> slept 50ms
③ 不可取消 signal: [{"type":"text","text":"slept 50ms"}] | isError: false
```

退出码 `0`。

**四个观察**：

1. **中途取消 → `ABORTED`**：body **没有被杀** —— 它把 400ms 睡满了。源码注释原话：「Cancellation never abandons the body: a started promise reaches quiescence before its outcome becomes `ABORTED`」（`index.ts:1519-1521`）。中途 `exec.signal.aborted` 翻成了 `true`（body 本可以观察到并提前收工，这个 body 故意无视）；body 返回的成功值被流水线**替换**成 `Error: tool call aborted`（`index.ts:1602-1606`：调用方已取消 && 结果不是错误 → 换成取消结果）。
2. **预先取消 → `ABORTED_BEFORE_DISPATCH`**：body **根本没被调**（`[body]` 一行没打）。`prepareExecution` 有三道检查点（`index.ts:1460、1473、1490`），读到原始调用方 signal 已 aborted 就直接短路成取消结果。
3. **丢弃式 controller（教程写法）→ 永不取消**：`aborted` 全程 `false`，正常成功。
4. **取消也发 `tools/result`**，观察者看到的是**替换后**的最终结果（`isError=true`）—— 与 [7.4](#74-校验发生在-execute-之前) 「失败和成功一视同仁」的结论一致。

一个容易混淆的细节：body 拿到的 `exec.signal` 不是调用方的原始 signal，而是**融合**产物（`fuseToolSignals`，`index.ts:1879` —— 调用方 signal 与 around-wrapper 替换的 signal 熔成一个）；而「调用方取消了吗」的判定（`callerCancelled`，`index.ts:1500-1505`）**始终读原始 signal** —— wrapper 骗不过取消判定。两个错误码常量在 `index.ts:462、465`。

---

## 7.7 缺了 systemPrompt：整条链 PENDING

教程：「缺少提供方时，工具插件会像第 6 章所述那样保持 PENDING。」把 `@deepseek-ai/dsh-system-prompt` 从 yml 里删掉，带上第 6 章的 diagnose 插件看状态：

**📄 文件** `01-learn-basics/examples/cordis-tutorial/07-missing-provider/cordis.yml`

```yaml
# 注意：故意【不放】@deepseek-ai/dsh-system-prompt
# dsh-tools 注入 systemPrompt → 它 PENDING → 注入 tools 的插件也 PENDING
- name: '@deepseek-ai/dsh-tools'
- name: './greet-tool.ts'
- name: './diagnose.ts'
```

**📄 文件** `01-learn-basics/examples/cordis-tutorial/07-missing-provider/greet-tool.ts`（注册后打一行加载探针）

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet the named person.',
    parameters: {
      name: { type: 'string', required: true, description: 'Who to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))
  console.log('greet-tool loaded')
}
```

**📄 文件** `01-learn-basics/examples/cordis-tutorial/07-missing-provider/diagnose.ts`（与第 6 章 `06-pending-diagnose` 相同）

```ts
import { FiberState, type Context } from '@deepseek-ai/cordis'

export const name = 'diagnose'

export function apply(ctx: Context) {
  setTimeout(() => {
    for (const runtime of ctx.registry.values()) {
      for (const fiber of runtime.fibers) {
        if (fiber.state === FiberState.PENDING) {
          console.log(`${fiber.name} is PENDING — a required service is missing`)
        }
      }
    }
  }, 500)
}
```

**▶️ 运行**

```sh
cd tmp/cordis-tutorial/07-missing-provider
node --import tsx ../../../vendor/cordis/bin.js
```

**输出**

```
ToolRuntime is PENDING — a required service is missing
greet-tool is PENDING — a required service is missing
```

退出码 `0`。

**三个观察**：

1. **依赖链传导**：缺 `systemPrompt` → `ToolRuntime` PENDING → `tools` 服务不出生 → `greet-tool` PENDING。`greet-tool loaded` 从没打印。
2. **包条目的 fiber 名是类名 `ToolRuntime`，不是包名**。来源：`registry.ts:324` 的 `let name = plugin.name` —— loader 的 `unwrapExports` 已把指针换成 default 导出的类，而**类的 `.name` 属性就是类名**。同一行代码，对函数插件读到的是 `export const name`，对类插件读到的是类名 —— 这是第 5 章指针规则的又一个推论。
3. 500ms 后 diagnose 的定时器结束，剩下的 fiber 全是 PENDING，没人撑住事件循环 → **进程静默退出、退出码 0** —— 第 6 章 `06-disabled-silent-exit` 的同一现象。不知道这一点的人会把这次运行当成「成功了但什么都没发生」。

---

## 7.8 类型是免费的：声明合并与 brand

本章代码里有两处「看起来很神奇」的类型玩法，都值得拆穿：

**① `import type {} from '@deepseek-ai/dsh-tools'`** —— 花括号是空的，它导入了什么？

导入了这个包对 cordis 的**声明合并**（`packages/core/tools/src/index.ts:128-133`）：

```ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    tools: ToolRuntime
  }

  interface Events {
    // ... 'tools/pre-execute'、'tools/execute'、'tools/post-execute'、
    //     'tools/result'、'tools/change' 等事件的类型签名
  }
}
```

没有这行，`ctx.tools` 和 `ctx.on('tools/result', ...)` 过不了类型检查；有了它，运行时**零成本**（tsx 直接删掉 type-only import）。这和[第 4 章](04-事件.md#42-声明发出监听)的 `import type {} from './stats.ts'` 是同一个招式，只是从「文件级」升到了「包级」—— 每个 harness 包自带自己的事件类型和服务类型，装了包就有了类型。

**② `brandString<ToolCallId>('demo-1')`** —— 它在运行时做了什么？

什么都没做（`packages/util/brand/src/index.ts:28-30`）：

```ts
export function brandString<T extends Branded<string>>(value: string | T): T {
  return value as T
}
```

纯类型转换。`ToolCallId = Branded<'ToolCallId'> = string & { readonly [BRAND]: 'ToolCallId' }`（`packages/llm/llm/src/brand.ts:31`，经 dsh-llm 的 `export * from './brand.ts'` re-export）。作用是在**类型层面**把「provider 签发的调用关联 id」和普通字符串区分开 —— `SessionId` 传不进 `ToolCallId` 的位置，编译器直接拦。

真实场景里 `callId` 由 LLM provider 随工具调用签发；实验里没有模型，所以用 `brandString` 手工伪造一个 —— 这就是教程注释说的 "standing in for the model"。

---

## 7.9 从这里到完整 agent

教程收尾：真实 agent 就是这套组合**再加更多插件** —— LLM 适配器、agent loop、持久化、应用入口。对照 `packages/bundle/base/cordis.patch.yml`（base 层）和 `packages/bundle/headless/cordis.patch.yml`（headless 层），里面全是和本章 yml 同构的条目：包名 + config。

包名条目能被解析，是因为 loader 最终把 specifier 委托给 Node/tsx 的模块解析（`vendor/loader/src/internal.ts:58` 的 `import(specifier, parentURL, ...)`）—— 包名和 `./x.ts` 相对路径只是同一套条目机制的两种写法（本章 5 个实验里两种都实测过）。

---

## 7.10 自测

**Q1**：`cordis.yml` 里为什么必须有 `@deepseek-ai/dsh-system-prompt`？删掉它，现象是什么？怎么诊断？

<details>
<summary>参考答案</summary>

因为 `ToolRuntime` 声明了 `static inject = ['systemPrompt']`（`index.ts:781`）—— 工具要把自己的 schema 贡献进系统提示词（构造函数里 `ctx.systemPrompt.tools(...)`，`index.ts:825`）。

删掉后：`ToolRuntime` PENDING → `tools` 服务不出生 → 所有 `inject = ['tools']` 的插件跟着 PENDING → 没人撑事件循环 → **进程静默退出、退出码 0**，看起来像「跑了但什么都没发生」。

诊断：第 6 章的 registry 扫描（遍历 `ctx.registry`，打印 `FiberState.PENDING` 的 fiber），实测输出 `ToolRuntime is PENDING` + `greet-tool is PENDING`。

</details>

**Q2**：`[tool-logger]` 比 `tool replied:` 先打印，是并发时序的巧合吗？

<details>
<summary>参考答案</summary>

**不是巧合，是结构保证。** `execute` 的所有终结路径都汇到 `finishScheduledExecution`，它先 `notifyResult`（发 `tools/result`）、后 `return finalResult`（`index.ts:1634-1635`）。事件发生在结果物化过程**内部**，必然早于调用方拿到兑现的 promise。

推论：`tools/result` 观察者永远不可能「漏看」一次已返回的调用；反过来它也**改不了**结果（emit 模式 + 冻结的 exec + 观察者异常被吞）—— 要拦截得用 `tools/pre-execute` / `tools/post-execute` waterfall。

</details>

**Q3**：模型给了非法参数（`{ name: 42 }`），你写的 `execute` 会运行吗？调用方收到什么？

<details>
<summary>参考答案</summary>

**不会运行。** `defineTool` 返回的定义里，`execute` 被包了一层：先按 JSON Schema 校验参数，有违规直接 `throw new ToolArgsError(violations)`（`schema.ts:585-589`），用户代码不被触碰 —— 实测中 `[execute body]` 探针一次都没打印。

调用方收到的不是异常，是规范化的错误结果：

```json
{ "isError": true, "content": [{ "type": "text", "text": "Error: invalid arguments: \"name\" must be a string" }] }
```

且 `tools/result` 照常发出 —— 观察者看到的失败和成功一样多。

</details>

**Q4**：`import type {} from '@deepseek-ai/dsh-tools'` 这行删掉会怎样？

<details>
<summary>参考答案</summary>

**运行时零差别** —— 它是 type-only import，tsx 直接删掉（本章所有实验照跑）。

**类型检查时坏掉** —— 这行的唯一作用是把该包的 `declare module '@deepseek-ai/cordis'` 声明合并拉进来：`Context.tools` 属性和 `'tools/result'` 等事件签名（`index.ts:128-133`）。没有它，`ctx.tools` 是未知属性、`ctx.on('tools/result')` 的事件名和 payload 都没有类型。

和第 4 章 `import type {} from './stats.ts'` 是同一招式的包级版本。

</details>

**Q5**：`tools.register(...)` 的返回值被丢掉了（没接），插件卸载时工具还会被注销吗？

<details>
<summary>参考答案</summary>

**会。** 这个返回值就是 `ctx.effect` 的 disposer：`register` → `ScopedLayers.effect`（`index.ts:1047`）→ 内部是 `ctx.effect(function* ...)`（`scope/src/store.ts:233`），docstring 明说返回的是 "the exact disposer returned by `ctx.effect()`"。

effect 附着在插件的 fiber 上，fiber 回卷（插件卸载/HMR 重载）时自动调用 —— 第 2 章的契约原样成立。接住返回值只是为了能**提前手动**注销（实测：`dispose()` 后 `tools/change` 再响一次，再调用得到 `Error: unknown tool "greet"`）。

</details>

**Q6**：诊断输出打的是 `ToolRuntime is PENDING`，为什么不是包名 `@deepseek-ai/dsh-tools`？

<details>
<summary>参考答案</summary>

fiber 的显示名来自 `registry.ts:324`：`let name = plugin.name`。loader 的 `unwrapExports` 已经把指针换成了 `export default` 的 `ToolRuntime` 类，而**类的 `.name` 属性就是类名字符串** `'ToolRuntime'`。

妙处在于这正是第 5 章指针规则的同一条通路：同一行 `plugin.name`，对函数插件（指针 = 模块命名空间对象）读到的是 `export const name`，对类插件（指针 = 类）读到的是类名。想让包条目显示别的名字，给类挂 `static name`（会遮蔽内建类名）或改用对象字面量形态。🚧 这两种改名方式我没有实测。

</details>

**Q7**：教程里 `signal: new AbortController().signal` 是干什么的？如果调用方在一个 400ms 的工具跑到 100ms 时 `abort()`，调用方拿到什么？body 此刻在干什么？

<details>
<summary>参考答案</summary>

那是个**不可取消的占位符** —— `signal` 是 `ToolExecutionInput` 的必填字段（`index.ts:330`），而 controller 当场被丢弃，没人能对它 `.abort()`。真实场景里 controller 由 agent loop 持有（用户按停止时 abort）。

真的 abort 后：

- **调用方**拿到 `{ isError: true, error: { info: { code: 'ABORTED' } }, content: [{ text: 'Error: tool call aborted' }] }`；
- **body 没有被杀** —— 它继续跑，直到自然结束（流水线等它 quiesce，`index.ts:1519-1521`），返回的成功值在交还调用方之前被替换成取消结果（`index.ts:1602-1606`）。body 想早退得**自己**观察 `exec.signal.aborted`（协作式取消）；
- 若 signal 在 `execute` 调用**之前**就是 aborted，body 根本不执行，code 是 `ABORTED_BEFORE_DISPATCH`（三道检查点，`index.ts:1460、1473、1490`）；
- 两种取消都照常发 `tools/result` —— 观察者看到的是替换后的最终结果。

</details>

---

**本章一句话总结**：

> 第 7 章没有引入任何新的框架机制 —— `tools` 是第 3 章的 Service，`register` 的注销是第 2 章的 effect，`tools/result` 是第 4 章的 emit 事件，dsh-tools 包本身是第 5 章的类插件（`export default` + `static inject`），缺依赖时是第 6 章的 PENDING 与静默退出。
>
> **这正是 cordis 的设计目标：业务服务的作者只写业务（schema + execute），框架纪律由「服务 + effect + 事件」的形状自动保证。** 从这里到完整 agent，只是往 yml 里继续加这样的服务。

---
