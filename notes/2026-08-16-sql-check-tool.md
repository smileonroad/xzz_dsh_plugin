# 2026-08-16 — sql-check-tool，第一个给模型用的工具

## 事情是这样的

上篇写了 `/helloworld` 命令，那是给人用的，你敲斜杠，它立刻回话，不经过模型。这篇写它的镜像，工具，给模型用的。

工具是模型在思考过程中自己决定调用的东西。模型写了一段 SQL，拿不准对不对，它自己就会去调 `sql_check` 验证。整个过程不需要用户插手。

我一开始想做个 JSON 查询工具，跟官方 cookbook 里的 read_file 错开，后来用户拍板，做个 SQL 语法检查器，理由是它更贴近真实场景，模型经常生成 SQL，错了自己不知道，给它配个编译器。

## 一个重要的前置认知

写工具之前，得先知道工具的 schema 是怎么进到模型脑子里的。

dsh 的 `ctx.tools` 注册表背后挂着系统提示词装配器。你每注册一个工具，它的 name、description、parameters 会自动流进系统提示词，模型读提示词的时候就看到「有这么个工具可用」。

这个装配是免费的，但有个依赖前提，工具注册表服务（`@deepseek-ai/dsh-tools`）自己依赖系统提示词服务（`@deepseek-ai/dsh-system-prompt`）。这就是之前 CLAUDE.md 里那个坑的根源，工具插件一直 PENDING，多半是缺了系统提示词这个服务提供方。

## 最小代码，比命令还短

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'sql-check-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'sql_check',
    description: 'Validate SQL syntax and semantics against the SQLite parser.',
    parameters: {
      sql: { type: 'string', required: true, description: 'The SQL to check' },
    },
    output: {
      schema: { type: 'object', properties: { ... }, additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: ... }],
    },
    async execute(args, exec) {
      // args 是强类型 { sql: string }
      // 返回 canonical value，不 throw
    },
  }))
}
```

跟命令一样，三件套，`name`、`inject`、`apply`。区别在注册的东西从命令定义换成了 `defineTool` 包装的工具定义。

## 契约五块，逐个说

### parameters，声明即校验

`parameters` 是一个属性表，每个属性标 `type`、`required`、`description`。注意只有标了 `required: true` 的才必填，其他全部可选。

这里最大的福利是，模型生成的参数会**自动校验**。你不需要写任何校验代码，`defineTool` 在 execute 跑之前就用 JSON Schema 校验器过一遍，违规直接抛 `ToolArgsError`，结果进 isError。校验通过后，execute 收到的 `args` 是从 schema 推断出来的强类型，写代码的时候有补全，跑起来不踩雷。

### output，决定返回值的形态

output 三件套，`schema`、`render`、`presentationMeta`。

`schema` 是 canonical value 的形态，string、number、object、array 都行。这里踩了个坑，object 类型必须写 `additionalProperties: boolean`，这是必填项，TypeScript 会逼你写，但你不理解的话会愣一下，为什么多一个这玩意。其实它是在声明这个对象允不允许出现 schema 里没声明的字段，严格模式写 false。

`render` 是模型真正看到的文本。canonical value 是 `{ valid: false, errors: [...] }`，render 把它翻译成人话给模型看。

`presentationMeta` 是可选的投影函数，它把结果里 UI 需要的事实抽出来，持久化在 tool/result 事件里。后面讲 presentResult 会再提到它。

### execute，四条规则

1. 返回一个 canonical JSON value。对象、数组、标量都行，但必须是 lossless JSON。不要返回散文，不要让人从文本里抠 id。返回不了合法 JSON，会被判 isError。

2. 抛错 = isError，但「领域结果」不抛。这是 cookbook 最狠的一条规矩，也是我这个工具的设计灵魂。SQL 写错了，返回 `{ valid: false, errors: [...] }`，这是一个完全正常的成功结果。只有基础设施故障，比如引擎本身挂了，才 throw。为什么？因为对模型来说，机器坏了它不知道怎么办，只能放弃，但「SQL 不合法」是可处理的信息，它可以改、可以重试。

3. 尊重 `exec.signal`。调用被取消时 signal 会触发，工具要停止在途工作。pre-abort 的调用由注册表在 body 之前就拒绝了，body 内的检查是另一半契约。

4. `exec.agent` 可以做异步通知，把上下文注入下一次模型请求，但注意那不是唤醒，idle 的 agent 不会因此醒来。

### presentCall 和 presentResult，UI 卡片是纯投影

工具自己不发 UI，它只声明 card 词汇。generic 是默认卡片，terminal 是 shell 命令卡片，diff 是改文件卡片。

这两个函数有硬规则，必须是纯函数。它们跑在实时流上，也跑在会话日志重放上，所以不能碰 I/O，不能读会话状态，不能读时钟。违反这条，重放的时候就会崩。

presentResult 需要的结果事实，靠 presentationMeta 透传。我的工具在 meta 里存了 valid 和 errorCount，重放时卡片标题 `sql_check: 2 error(s)` 从 meta 重建，不重新解析任何东西。

`defineTool` 对 presenters 做软校验，坏的旧日志参数返回 undefined，fallback 到 generic 卡片，显示永远不能搞崩重放。

## 零依赖的技术选型

检查 SQL 语法，按常理要装 SQL 解析库。但我翻源码的时候发现，dsh 官方自己的 session-query-sqlite 包用的是 Node 内置的 `node:sqlite`，零第三方依赖。

我当场就抄了这个作业。

```ts
import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync(':memory:')
try {
  db.exec(sql)
  return { valid: true, errors: [] }
} catch (error) {
  // code === 'ERR_SQLITE_ERROR' 才是领域结果，其他一律 throw
}
```

每次调用新建一个内存数据库，检查完就关，无持久化，无跨调用状态。真实 SQLite 解析器，权威，准确。

我拿它跑了一轮实验，把错误消息的形态摸清楚了，语法错误是 `near "FROM": syntax error`，语义错误是 `no such table: missing_table`，空字符串 SQLite 居然接受。所以工具自己兜了空输入的底，返回一个 `empty` 错误类，因为模型传空串几乎一定是失误。

还有一个诚实的边界，检查器只说 SQLite 方言，description 里写明了，模型就不会拿 MySQL 的语法来问。

## 测试，延续「描述行为」哲学

测试装配跟命令那次一个套路，挂真实服务，走真实边界。

```ts
async function harness() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  await ctx.plugin(sqlCheckTool)
  return { ctx, tools: ctx.tools }
}

// 执行走 ctx.tools.execute，跟 agent 循环同一个入口
await ctx.tools.execute({
  signal,
  callId: CallId('call-1'),
  name: 'sql_check',
  arguments: { sql: 'SELECT FROM WHERE' },
})
```

八个用例，把行为钉死。

- 注册成功，schema 自动流进系统提示词装配（`assemble().tools` 里能查到）
- 有效 SQL 和 `CREATE TABLE; INSERT; SELECT` 多语句脚本都通过
- 语法错误分类成 `syntax`，且是**成功的 canonical value**，不是 isError，这是本工具的灵魂测试
- 表不存在分类成 `no-such-table`
- 空输入分类成 `empty`
- 缺参数被自动校验拦下，isError
- 重复注册抛 `tool "sql_check" is already registered`
- presenters 纯函数直接断言，坏的 meta 返回 undefined 不炸

有两个小坑记录一下。`assemble().tools` 里的 parameters 是完整 JSON Schema 形态，带 `properties` 包装，断言要写 `{ properties: { sql: { type: 'string' } } }`，不是扁平的。拿已注册定义用 `tools.get(name)`，不是 find。

## 挂进 web，这次不用重启的坑

上篇说过，web 加插件必须重启进程，因为 HMR 发布版默认禁用。

但这次我做了个一劳永逸的事，把插件写进了 profile 的用户层补丁 `~/.dsh/profiles/web/cordis.patch.yml`。这个文件每次启动都会应用，不用每次带 `--patch`。

```yaml
- insert:
    - id: helloworld
      name: './examples/helloworld-command/src/index.ts'
    - id: sql-check-tool
      name: './examples/sql-check-tool/src/index.ts'
```

路径还是 junction 相对路径的方案，上一篇文章讲过了。重启之后 dump-config 确认两个插件都在组合树里，web 日志里出现一行 SQLite 的 ExperimentalWarning，那正是插件加载 node:sqlite 的指纹。

## 端到端验证，模型真的会自己用

挂载成功不算完，还得证明模型真的会用。我在 web 里新建会话，发了一条消息，请使用 sql_check 工具检查 SELECT FROM WHERE 这句 SQL 是否合法。

等模型跑完一轮，会话日志和界面都给出了完整链路。

```
用户消息 请使用 sql_check 工具检查 SELECT FROM WHERE 是否合法
    ↓
工具调用卡片  sql_check … SELECT FROM WHERE      ← 模型自主发起调用
    ↓
工具执行  返回 { valid: false, errors: [{ type: 'syntax', message: 'near "FROM": syntax error' }] }
    ↓
模型回复  The SQL `SELECT FROM WHERE` is invalid. The error is a syntax error near "FROM".
```

界面上的工具调用卡片渲染正常，模型读到了结构化错误，还自己多调了一次，拿合法 SQL 对比验证。

更有说服力的是重放。重新打开页面，点进这个会话，整个链路从持久化日志里原样重放出来，用户消息、工具调用卡片、工具结果、模型回复，一个不少。这正是 presenters 必须保持纯函数的原因，日志重放的时候没有任何实时数据可以依赖，卡片只能从 args 和持久化的 meta 重建。

还有一个视角值得专门说，会话的轨迹视图。界面上除了对话流，还有一个轨迹面板，它展示的是会话事件的原始轨迹，每一轮发生了什么，一条一条按顺序排。在里面能看到 `sql_check` 的调用记录，工具名、参数、结果都列得清清楚楚。对话流是给人看的加工品，轨迹是给查问题的人看的原始账本。验证工具是否真的被调用，轨迹是最直接的证据。

所以工具的验证闭环是三层，注册装配（dump-config）、行为（测试）、真实模型轮次（web 端到端）。三层都过了，才敢说这个工具能用。

## 接下来该干嘛

如果你也想试试，一条路径。

先跑通上篇的 `/helloworld` 命令，理解插件的三件套。然后照这个 `sql_check` 的模板，把 execute 里换成你自己的逻辑。跑测试用 `ctx.tools.execute` 走真实边界。挂 web 写进 profile 的 cordis.patch.yml，重启一次，之后自动生效。

工具和命令的边界，写多了自然就分清了。给用户抄近道的写命令，给模型长手的写工具。
