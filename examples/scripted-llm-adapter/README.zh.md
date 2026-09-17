# scripted-llm-adapter 实战

[English](README.md) | 中文

给 harness 接一个**不用联网、不要密钥**的模型提供方。这一篇练的是 harness 的模型边界：适配器（LLM adapter）站在中间做同声传译，进去时把 harness 的请求翻成厂商的请求，出来时把厂商的响应翻回 harness 内部唯一认的那门语言——**规范分片流**。上层的 agent loop、工具调用、用量计量、会话压缩全都踩在这条约定上，这个实战把它摊开看一遍。

和已有的实战互补：`units-capability` 自造了一条能力 seam，练的是「怎么设计 seam」；这一篇接的是**内核既有的 seam**，练的是「怎么给已经存在的 seam 当提供方」。

## 运行

本目录是源码的**权威来源**。要运行，先拷到 deepseek-harness 源码的 `examples/` 下（那边的副本可能过期），再在 deepseek-harness 根目录操作：

```sh
# 1. 拷进 deepseek-harness（权威源在本仓库）
cp -r examples/scripted-llm-adapter ../deepseek-harness/examples/scripted-llm-adapter

cd ../deepseek-harness

# 2a. 跑测试（harness 的 vitest 工作区已不含 examples/，用随本目录分发的配置）
pnpm exec vitest run --config examples/scripted-llm-adapter/vitest.examples.config.ts examples/scripted-llm-adapter

# 2b. 离线演示：不用 key、不联网，也不碰你真实的 ~/.dsh
node examples/scripted-llm-adapter/scripts/demo.mjs "你好"
node examples/scripted-llm-adapter/scripts/demo.mjs "帮我看看权限配置"   # 命中门禁，不调模型

# 2c. 挂进 web（可选；web 发布版 HMR 默认禁用，要重启进程）
pnpm dsh web --patch examples/scripted-llm-adapter/cordis.patch.yml
```

演示脚本会在临时目录造一个一次性 `DSH_HOME`，在里面写 `settings.yaml`（把默认模型指到 `scripted/demo`）和一个 overlay，跑完删掉。之所以不能只靠 `cordis.patch.yml`，是因为 `agent-default-model` 的值归 **settings 用户层**管，它会盖掉组合层配置，而真实 home 里通常已经存了用户的模型选择。想直接用 `cordis.patch.yml` 的话，先清掉 `~/.dsh/settings.yaml` 里 `agent-default-model:` 那一段。

> patch 里 entry 的 `name` 相对**本 patch 文件所在目录**解析，不是相对 profile 目录，也不是相对 cwd。`cordis.patch.yml` 住在自己目录里，所以写 `./src/index.ts`；要写绝对路径时 Windows 必须带 `file:///` 前缀，裸 `D:/...` 会被当成 URL scheme 报错。
>
> 容易混的是另一份文件：profile 目录下的 `cordis.patch.yml` 才按 **profile 目录**解析，那一份写 `./examples/<项目>/...` 时才需要 profile 里的 examples junction。所以用 `--patch` 挂本示例不需要建 junction：
>
> ```sh
> pnpm dsh web --patch examples/scripted-llm-adapter/cordis.patch.yml
> ```

### 在 web 里验证

启动后按顺序看这几件事，每一步都有明确的预期。

1. **启动日志**里不应出现 `warning: N entry did not activate` 或 `failed to import`。出现了就是入口没挂上，先按上面的 name 规则检查路径。
2. **模型选择器**（输入框上方的模型名）里应该出现 `Scripted (scripted)` 分组，下面有 `Scripted demo`。它来自适配器的 `providerInfo` 与 `listModels`。
3. **发一句「你好」**，回复应是 `[scripted] 你好`。如果来的是真模型的正常回答，说明 `~/.dsh/settings.yaml` 里 `agent-default-model` 的旧选择盖住了 patch 的配置，在界面上重选一次模型就会写回 settings。
4. **再试三条指令**。`think:先想一下` 先出思考块再出文本；`fail:RATE_LIMIT 手滑了` 让这一轮以错误结束（错误码 RATE_LIMIT）；`hang:` 让回复停在一句 `partial`，点停止后这条消息被标记为已打断。
5. **试一次门禁**。把「你好」换成「帮我看看权限配置」，回复应该是 `非法内容，请重新输入。（命中：权限）`，而且这一轮不会调用模型。
6. **工具链路**。写 `tool:<工具名> {...}`（工具名用界面上能看到的），工具会真的执行，然后第二轮把结果回显成 `[scripted] tool returned …`。名字写错也算跑通一次完整回路，回显会变成 `[scripted] tool returned Error: unknown tool "…"`。

## 设计

### 一次模型调用经过谁

```
agent loop 想调模型
      │  组装 GenerateOptions（历史消息、系统提示词、工具 schema、生成参数、signal）
      ▼
 ctx.llm.stream(options)
      │  ① llm/stream 瀑布：插件可以在这里包一层
      ▼
 选路由：options.provider 找适配器，options.model 是厂商模型 id
      │  ② prepareCall() → resolveModel()：问清身份、上下文窗口、reasoning 能力
      ▼
 adapter.stream(options)   ← 本实战实现的就是这个方法
      │  ③ 发规范分片
      ▼
 装配器拼成一条 assistant 消息
      │
      ├─ 模型要求调工具 → 工具执行 → 结果塞回历史 → 再来一轮
      └─ 否则 → 本轮结束
```

这条链上只有 `stream()` 是必须实现的。`LlmAdapter` 的 `providerInfo` / `listModels` / `resolveModel` / `prepareCall` 都有默认实现，本项目按需要覆写它们，用来演示「目录是建议性的、能力要如实声明」。`prepareCall` 的默认实现把「解析出的模型元数据」和「这一代适配器的 stream 入口」绑成一个原子对，防止动态目录型适配器在两次查询之间换了配置，出现「用 A 代的能力发 B 代的请求」。

### 回答是怎么定下来的

适配器把请求交给 `src/script.ts`，那里是一个纯函数：从 `GenerateOptions.messages` 里读最后一条人类消息，按回答规则得出本轮要说什么。真适配器在这一步解析厂商的 SSE 流，我们解析这套规则，所以整个示例离线可跑。

读消息历史时有两个反直觉的地方，代码里各有一处判断，测试各钉了一条用例。

| 现象 | 处理 | 为什么 |
| --- | --- | --- |
| 工具结果消息的 `role` 是 `user` | 看「有没有 `tool-result` 块」，并对历史末尾单独判一次 | 规范词汇里工具结果复用 user 角色，只看角色会把它当成新的用户指令，于是无限重复调用工具 |
| harness 会往历史里插自己生成的 user 消息 | 优先取 `source.kind === 'user'` 的那条 | 工作区指令、技能目录这类内容也以 user 消息进入请求，但它们不是人说的话 |

### 分片按什么顺序发

协议义务写得很细，`src/script.ts` 的 `renderTurn()` 是它的最小实现。

| 规则 | 为什么 |
| --- | --- |
| 每个 `block-start` 配一个 `block-end`，`block-end` 带上拼好的整块 | 装配器只信 `block-end` 里的块，delta 只用来做实时呈现 |
| 块 `index` 按首次出现顺序分配，同一块的 delta 复用同一个 index | 多个块可以交错流式返回，index 是唯一的关联键 |
| 工具调用参数全程是原始 JSON 字符串，增量走 `argumentsDelta` | 模型产出的参数可能是半截 JSON，提前解析会失真 |
| `usage` 在 `finish` 之前，`finish` 之后不再发任何分片 | 消费方靠 `finish` 判定结束，之后的内容会被当成协议错误 |

> **深入：这些规则不是文档承诺，是运行中的检查。** `packages/llm/llm/src/invariant.ts` 本身就是一个 `llm/stream` 瀑布监听器，注册时带 `{ global: true, prepend: true }`，排在所有插件前面。它逐块校验块启停、delta 与块类型是否匹配、`usage` 是否重复，以及 `finish` 之后有没有多出分片。测试里那个「故意写错的适配器」就是撞在这面墙上：`finish` 之后再发一个 delta，整条流以 `LLM stream emitted text-delta after terminal finish` 结束。内核里还留着 `EMPTY_RESPONSE` 这类分类，因为「正常结束但一个块都没有」不能当成一条空的助手消息放过去，否则这一轮会静默地什么都不发生。

### 出错走哪条路

| 路径 | 用在哪 | 消费方看到什么 |
| --- | --- | --- |
| 适配器**抛** `LlmError`（带稳定 code） | 传输故障、协议故障、不支持的请求字段 | `LlmRuntime.stream()` 把异常**规范化**成终态 `finish`，消费方永远看到 finish，看不到异常 |
| 以 `finish { kind: 'error' \| 'aborted' }` **收流** | 提供方带内故障、取消 | 同样是终态 finish，`failure.code` 由适配器给出 |

两条路径的差别只在适配器这一侧；对消费方来说结果一致。本示例两种都实现了，测试分别断言：`fail:` 指令抛 `RATE_LIMIT`，`provider-fail:` 指令直接收流成 error finish，中途 abort 则由运行时按 `signal` 归类成 `aborted`。

### 能力声明与注册

`resolveModel()` 声明的东西会被真实校验。声明了 reasoning 能力时，选项按适配器给的有序不透明 ID 原样透出，包括 `off`；调用方显式指定了不支持的强度，`LlmRuntime` 会在调用 `stream()` **之前**拒绝，测试用「`stream()` 一次都没被调用」把这条钉住。省略强度时会落到适配器声明的默认值。

注册的规矩也值得记住。同一个 route 只能有一个适配器，重复注册抛 `DUPLICATE_ADAPTER`；一次注册多个 route 要么全成要么全败；注册返回的句柄除了注销，还有一个 `replace()` 能原子换路由，先整体校验再同步置换，中途没有空窗；句柄释放之后再 `replace` 抛 `REGISTRATION_DISPOSED`。注册本身是副作用，跟着插件生命周期自动回收，所以 HMR 安全。

### 拦截层：不调模型也能回答

上面那张图里的第 ① 步是一条瀑布，插件可以在模型调用外面包一层，甚至根本不往下传。本示例用它做了一个敏感词门禁（`src/guard.ts`）：输入里带「权限」「密码」这类词就直接回一句「非法内容，请重新输入。」，适配器一次都不会被调用。

这段策略没有写进适配器，因为策略不该长在提供方身上。换个真模型，适配器就换了，而门禁与用哪个模型无关，「模型调用之前」才是它的位置。

| 想做的事 | 用哪个扩展点 | 代价 |
| --- | --- | --- |
| 命中就返回一句自定义回复，不调模型 | `llm/stream` 瀑布（本示例的做法） | 回复得是一段合规的分片流；用户原文仍会进会话 |
| 静默吞掉这一步，用户什么也看不到 | `agent/pre-step` 返回 `{ kind: 'reject' }` | 这一轮以 `blocked` 结束；同样阻不住原文产生 inbox 事件 |
| 改写后再放行（脱敏、补上下文） | `agent/pre-step` 返回 `{ kind: 'enter', messages }` | 模型仍会被调用，只是看到的是改写后的内容 |

三个实现细节值得记一下。第一，判断对象是「最后一条人说的话」，工具结果和 harness 注入的 user 消息都不算（`lastUserText()` 已经处理过这两个坑）。第二，`options.purpose` 非空的是压缩、起标题这类后台调用，必须直接放行，否则会打断它们。第三，拒绝时返回的必须是一段**合规**的分片流（块启停配对、`finish` 收尾），因为它和适配器的产出走同一条校验；测试里特意把它挂在包不变量下跑了一遍。没有发生模型调用，所以不报 `usage`。

> **深入：为什么门禁能「假装」成模型。** 在 agent loop 眼里，`llm/stream` 返回什么就是什么：它拿到一段规范的文本分片流，装配成一条助手消息，记进会话，界面照常渲染。拦截层没有说谎，它只是把「这段流是谁产出的」从厂商 API 换成了本地策略。这也解释了 `llm/stream` 为什么是个有分量的扩展点 —— 重试、压缩、用量计量都挂在同一处。

## 核心代码解读

四个文件按「插件壳 → 规划 → 发流 → 拦截」的顺序读，加起来不到四百行。

### 1. 插件壳（`src/index.ts`）

```ts
export const name = 'scripted-llm-adapter'
export const inject = ['llm']
export const Config: Schema<Config> = Schema.object({
  providers: Schema.array(Schema.string()).default(['scripted']),
  models: Schema.array(ModelSchema).default(DEFAULT_MODELS),
})
export function apply(ctx: Context, config: Config): void {
  ctx.llm.registerAdapter(config.providers, new ScriptedAdapter(config.models))
}
```

`inject` 保证 `ctx.llm` 就绪才执行 `apply`。配置走 Schemastery，路由名和模型目录都能在 patch 里改，不用改代码。注册是副作用，插件卸载时这些路由自动撤掉，所以 HMR 安全。

### 2. 规划（`src/script.ts`）

纯函数，不碰 Cordis 也不碰网络，所以能单独测。它干两件事，先认出「人在说什么」，再算出这一轮该发哪些分片。

```ts
export function planTurn(options: GenerateOptions): ScriptedTurn {
  const completed = toolResultText(options)
  if (completed !== undefined) return { kind: 'text', text: `${ECHO_PREFIX}tool returned ${completed}` }
  const prompt = lastUserText(options).trim()
  const match = COMMAND.exec(prompt)
  // ...
}
```

开头两行就是前面说的两个坑。历史末尾是工具结果，说明这一轮该收尾，不能再调一次工具；`lastUserText()` 里优先取来源是用户的文本，把 harness 注入的提醒排除掉。

发分片的那段严格照协议顺序写。

```ts
chunks.push(
  { type: 'block-start', index, blockType: 'tool-call' },
  { type: 'tool-call-delta', index, id, name: turn.name, argumentsDelta: turn.arguments.slice(0, split) },
  { type: 'tool-call-delta', index, id, argumentsDelta: turn.arguments.slice(split) },
  { type: 'block-end', index, block: { type: 'tool-call', id, name: turn.name, arguments: turn.arguments } },
  { type: 'usage', usage: { inputTokens, outputTokens: outputTokens + turn.arguments.length } },
  { type: 'finish', reason: { kind: 'tool-calls' } },
)
```

参数故意拆成两段发，是为了让「增量拼接」在测试里看得见；`arguments` 从头到尾都是原始 JSON 字符串，不提前解析，因为模型产出的参数本来可能是半截 JSON。

### 3. 发流（`src/adapter.ts`）

`stream()` 是唯一必须实现的方法。前两行把请求留档，然后按规则分流。

```ts
this.requests.push(options)
if (options.stop !== undefined) throw new LlmError('the scripted provider cannot honour stop sequences', 'UNSUPPORTED_OPTION')
const turn = planTurn(options)
if (turn.kind === 'failure') throw new LlmError(turn.message, turn.code)              // 抛，由运行时规范化
if (turn.kind === 'empty') throw new LlmError('...', EMPTY_RESPONSE_CODE)
if (turn.kind === 'hang') { /* 发半截文本 */ await interrupted(options.signal); return }
for (const chunk of renderTurn(turn, options)) {
  if (options.signal?.aborted === true) throw new Error('the scripted stream was aborted')
  yield chunk
}
```

三个分支对应三种失败形态，最后一段是正常路径。每个分片发出前都看一眼取消信号；挂起分支靠 `interrupted()` 等信号，没有信号就真的等着，这正是 `hang:` 想演示的行为。留档的 `requests` 不只是方便调试，测试用它的长度为 0 来证明某条路根本没进模型。

### 4. 拦截层（`src/guard.ts`）

```ts
ctx.on('llm/stream', (options, next) => {
  if (options.purpose !== undefined) return next()
  const hit = matchBlockedWord(lastUserText(options), config.words)
  if (hit === undefined) return next()
  return refusalStream(`${config.refusal}（命中：${hit}）`)
})
```

瀑布的规矩是谁不调 `next()` 谁就是终点。这里两个放行条件排在前面，后台调用和没命中都照常往下走；命中就返回一段自己造的分片流，适配器完全没被碰到。拒绝流本身也要合规，否则会被包不变量拦下，测试里专门验过。

## 回答规则怎么写

规矩只有一条，最后一条人类消息的开头决定这一轮说什么。

| 写法 | 效果 | 为什么留着它 |
| --- | --- | --- |
| `think:<内容>` | 先发思考块，再发文本块 | 练多个块的 index 分配 |
| `tool:<名字> <JSON>` | 发一个工具调用块（参数原样作 JSON 字符串） | 练工具调用块与第二轮：工具结果回来后回显结果 |
| `fail:<CODE> <描述>` | 抛 `LlmError` | 练「传输故障」路径与异常规范化 |
| `provider-fail:<CODE> <描述>` | 以 error finish 收流 | 练「带内故障」路径 |
| `empty:` | 抛 `EMPTY_RESPONSE` | 练退化补全的分类 |
| `hang:` | 发半截文本后停住等取消 | 练 abort 与资源停稳 |
| 其它 | 回显 `[scripted] <原文>` | 演示与手动试玩 |

## 测试

21 条，分五组。每一组都打在真实运行的那一层上，不去测内部函数。

16 条，分四组。每一组都打在真实运行的那一层上，不去测内部函数。

**第一组，跑完整的一轮对话。** 用 harness 自己的测试装配（`agent-loop-testkit`）把真实的 `AgentLoop` 挂起来，插件像普通插件那样装进去，然后像用户一样发一句话。看三件事：模型说的话有没有被正确拼成一条助手消息、用量算得对不对、工具能不能真的被调起来（发 `tool:echo {"text":"hi"}` 这样的指令，跑完两轮，参数从头到尾保持原始 JSON 字符串）。还有一条专门防坑：harness 会往对话历史里塞它自己生成的 user 消息（工作区指令、技能目录之类），测试确认模型不会把这种消息当成人在说话。顺带钉住一件反直觉的事：会话日志里记的不是适配器原样的分片，而是连续增量被折成一条记录的打包形态。

**第二组，只看协议。** 直接读 `ctx.llm.stream()` 的输出，不经过 agent。看块的顺序和编号对不对；发一条故意写错的流（`finish` 之后再多发一个分片），确认会被内核的不变量拦下来；适配器抛异常后消费方拿到的是不是一条规范的 error finish；带内故障、`UNSUPPORTED_OPTION`、`EMPTY_RESPONSE`、中途取消，是不是各自走了该走的那条路。

**第三组，能力声明。** 声明了哪些 reasoning 强度就得守规矩。调用方点名要一个没声明的强度时，`stream()` 一次都不该被调用；不点名时应该落到声明里的默认值；目录里没列的模型 id 照样能用，因为目录只用来展示。

**第四组，注册。** 同一个路由不能有两个适配器；`replace()` 换路由是原子的，换的过程中没有请求会掉进空窗；句柄释放之后再换会抛 `REGISTRATION_DISPOSED`。

**第五组，拦截层。** 命中词表时返回拒绝文本，且适配器一次都没被调用；没命中就照常走模型；后台辅助调用不设门禁；敏感词只出现在工具结果里时不拦；拒绝流本身能通过包不变量。

## 已知限制

- 本示例不解析任何厂商协议，也就不涉及 HTTP 请求映射、`attributionHeaders()`、SSE 解析与重试分类。想练那一层，把离线模型换成对着 `packages/test-support/llm-mock-server`（OpenAI 兼容的故障服务器）写的 HTTP 适配器就行。
- 门禁只拦「人说的话」，而且拦下之后用户原文仍然在会话历史里。若合规要求原文也不落盘，得改用 `agent/pre-step` 的 `{ kind: 'reject' }`，并自行确认 inbox 认领事件里是否仍带原文。
- 词表是子串匹配，容易误伤：「权限管理」也会被拦。词表走 `Config`，可以在 patch 里改（见 `cordis.patch.yml`），也可以换成正则或加白名单。
- `listModels()` 只做展示。它会不会出现在浏览器选择器里已在 host 侧验证（测试直接调用 web 用的那个 `buildModelCatalog`），但没有自动化的浏览器点击验证。
- 离线模型不做任何真实推理，`usage` 是按消息条数与字符数推算的，别拿它做计量实验。

## 怎么分发

本示例按教学示例交付，不带 `package.json`，不参与 bundle 通道。要做成可安装包（`package.json` 声明 `dsh.bundle.patch`、自带 `cordis.patch.yml`、预构建 `lib/`）的完整流程见 [docs/plugin-package.md](../../docs/plugin-package.md)，现成的两个样板是 [grill-send-button](../grill-send-button/) 与 [reply-tips](../reply-tips/)。
