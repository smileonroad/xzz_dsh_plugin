# 2026-09-17 — scripted-llm-adapter，给 harness 接一个自定义的模型

## 事情是这样的

前面十来篇，命令、工具、能力 seam、事件、审批、界面都摸过一遍了。

- units-capability 那篇自造了一条能力 seam，练的是怎么设计一条；
- events-demo 那篇练的是瀑布事件里观察者和决策者的纪律。

这些插件挂的位置各不相同，但**底下压着同一条地基，模型那一轮调用**。工具要等模型决定调它，事件里的内容也多半是模型写出来的，界面渲染的也是模型的产物。**这条地基一直没有亲手搭过。**

在 harness 里，「模型」不是一个函数调用，而是一份正式的协议，没弄懂它就没法稳妥地改它的行为。

所以这一篇自己当了一次模型提供方。**写出来的东西叫 `scripted-llm-adapter`，一个不联网、不要密钥、说什么全由规则决定的模型。**它能在 headless 里一条命令跑起来，也能出现在 web 的模型选择器里。顺带那个敏感词门禁也做了，挂在模型调用之前。

## 模型调用这一路经过谁

先把链条画出来，后面所有讨论都落在这张图上。

```
agent loop 决定要问模型
      │  组装请求（历史消息、系统提示词、工具 schema、生成参数、取消信号）
      ▼
 ctx.llm.stream(请求)
      │  ① llm/stream 瀑布，插件可以在这里包一层，也可以根本不往下传
      ▼
 选路由，请求里的 provider 决定找哪个适配器，model 是厂商那边的模型 id
      │  ② prepareCall 先问能力，再绑定这一代适配器的 stream 入口
      ▼
 adapter.stream(请求)        ← 这一篇实现的就这个方法
      │  ③ 产出规范分片
      ▼
 装配器把分片拼成一条完整的助手消息
      │
      ├─ 模型要求调工具，工具执行，结果塞回历史，再来一轮
      └─ 不然这一轮就结束了，消息进会话
```

`packages/llm/llm/src/index.ts` 里的 `LlmAdapter` 有四个方法，**只有 `stream()` 必须自己写**。另外三个都有默认实现，`providerInfo` 报身份，`listModels` 报目录，`resolveModel` 报能力。

`prepareCall` 的默认实现把「这个模型有哪些能力」和「这一次请求从哪个入口发出去」合成一次问完，答案绑在一起用。绑的原因是有些适配器的模型目录运行时才现拉，两次操作之间配置可能已经换了，**不绑就会出现拿着旧模型的参数去请求新模型**。我们的离线模型用不上这层保护，默认实现顺手就给了。

适配器在 `resolveModel` 里声明这个模型支持哪些思考强度（reasoning，比如 off、low、high）。**这个声明不是摆设，没声明过的强度框架不会放行**，服务在调用 `stream()` 之前就报错。

## 分片这件事比想象中较真

**模型回话不是一句话，是一串分片。七种分片归起来只有三件事，三种内容块（文本、思考、工具调用）、每个块的开始与结束、以及收尾的用量和结束原因。块之间靠 `index` 关联，同一块的每次增量复用同一个编号，最后由 `block-end` 一次性交出拼好的整块。**

义务有这么几条。每个 `block-start` 必须有配对的 `block-end`，**`usage` 要在 `finish` 之前，`finish` 之后不许再冒任何东西**，工具调用的参数从头到尾都是原始 JSON 字符串，增量用 `argumentsDelta` 送。

真正让我记住这些的不是注释，是 `packages/llm/llm/src/invariant.ts`。它自己就是一个 `llm/stream` 的监听器，注册时带 `{ global: true, prepend: true }`，排在所有插件前面，逐块检查上面那几条。我特意写了个坏适配器，在 `finish` 之后又发了一个 `text-delta`，整条流当场以 `LLM stream emitted text-delta after terminal finish` 结束。

一条工具调用的分片长下面这样，这是测试里的断言结果。参数被刻意拆成两段增量，让「拼」这个动作看得见。

```
block-start      index 0  tool-call
tool-call-delta  index 0  id 名字 argumentsDelta '{"text":'
tool-call-delta  index 0  id 名字 argumentsDelta '"hi"}'
block-end        index 0  块 = { 原始 JSON 字符串 }
usage
finish           reason tool-calls
```

**约束能被故意违反一次并当场抓到，比读三遍文档都牢。** 这一招我后来当成了习惯。

## 离线模型怎么说话

规则很短，**最后一条人类消息的开头决定这一轮说什么**。

```
think:<内容>                 先说思考块再说文本块
tool:<名字> <JSON>           要求调工具
fail:<CODE> <描述>           适配器抛错
provider-fail:<CODE> <描述>  以 error finish 收流
empty:                      正常结束但无内容，按 EMPTY_RESPONSE 报错
hang:                       发半截文本后停住等取消
其它                          回显 [scripted] 原文
```

这套前缀让演示和测试共用一条通道，协议细节也都能手动触发。

## 目录与选择，都是建议性的

模型提供方还要回答两个问题，有哪些模型，某个模型的准确能力是什么。这两件事分得很开。

`listModels` 是目录，**只用来展示**，目录里没列出的模型 id 照样能用，测试专门断言过。准确能力放在 `resolveModel`，上下文窗口和 reasoning 选项只在那里。

浏览器里的模型选择器读的是 `packages/api/session-controller/src/catalog.ts` 的 `buildModelCatalog`。我原先在 README 里写着「选择器能不能看到还没验证」，后来补了一条测试直接调这个函数，断言 `Scripted (scripted)` 分组和 `Scripted demo` 都在里面。

## 出错有两条路，消费方只看到一条

适配器可以**抛**一个带稳定 code 的 `LlmError`，也可以以 `finish { kind: 'error' }` 或 `{ kind: 'aborted' }` **收流**。前者是传输和协议故障，后者是提供方带内故障，差别只在适配器这一侧。

**消费方永远只看到终态 finish**，因为 `LlmRuntime.stream()` 会把抛出来的异常规范化成结束分片。我第一版断言写成了「抛出去」，跑起来才发现拿到的是 `finish`，只好改成断言 `finish.reason.failure.code`。

取消同理。规则里的 `hang:` 发半截文本就停住等信号，中途取消被运行时按信号归类成 `aborted`。测试里得**先等第一个分片落地再取消**，否则取消早于任何内容，会话里连一条打断的助手消息都不会留下。

## 离线模型踩到的三处反直觉

三处都跟「怎么从请求里认出用户那句话」有关，代码里各留了一处判断，测试各有一条用例。

| 现象 | 处理 | 原因 |
| --- | --- | --- |
| 工具结果消息的 `role` 是 `user` | 不看角色，看有没有 `tool-result` 块 | 规范词汇里工具结果复用 user 角色，只看角色会把它当成新的用户指令 |
| harness 会往历史里插它自己生成的 user 消息 | 优先取 `source.kind === 'user'` 的那条 | 工作区指令、技能目录这类内容也以 user 消息进入请求，但它们不是人说的话 |
| 会话日志里存的不是适配器原样的分片 | 断言改成打包形态 | 连续增量会被折成一条 `text-chunks` 记录，为了重放时无损又省地方 |

第一条后果最直接，工具结果被当成新指令，模型会不停重调同一个工具。我第一版就这么写的，测试里两个回合直接变成无限回合。

第二条是演示抓到的，第一次跑 headless，回显的是一整篇技能目录。**模型不能靠「最后一条 user 消息」认人，得分辨谁在说话。**

## 顺手做的拦截层

回到开头那件小事。命中敏感词就不让模型看见，直接回一句重新输入。

**策略没有写进适配器，位置不对。** 你把离线模型换成真的 deepseek，适配器就换了，门禁也跟着没了。它属于「模型调用之前」，正好是图上第 ① 步那条瀑布。

`src/guard.ts` 挂上 `llm/stream`，命中词表时自己造一段合规分片当回答，**适配器一次都不会被调用**。三个细节。

- 判断对象必须是**人说的话**，工具结果和注入的提醒都不算，这条直接复用 `lastUserText()`。
- `options.purpose` 非空的是压缩、起标题这类后台调用，必须原样放行，否则会把它们一起打断。
- 拒绝流本身也得**合规**，它和适配器的产出走同一条校验，测试里挂在包不变量下又跑了一遍。

| 想做的事 | 用哪个扩展点 | 代价 |
| --- | --- | --- |
| 命中就回一句自定义文案，不调模型 | `llm/stream` 瀑布 | 回复得是一段合规分片流，用户原文仍会进会话 |
| 静默吞掉这一步 | `agent/pre-step` 返回 `{ kind: 'reject' }` | 这一轮以 blocked 结束，同样拦不住原文产生 inbox 事件 |
| 脱敏或补上下文后放行 | `agent/pre-step` 返回 `{ kind: 'enter', messages }` | 模型还是会被调用，只是看到的是改写后的内容 |

缺口在这。门禁只挡住了模型，**用户原文已经进了会话历史**。合规上要求原文不落盘，就得换 reject 路线，还要自己核一遍认领事件里带不带原文。README 的已知限制写了这条。

## 测试是怎么写的

二十一条，分五组。

- **端到端**用 `agent-loop-testkit` 挂真实的 `AgentLoop`，插件当普通插件装进去，然后像用户一样发消息。看的是回复有没有拼成助手消息、用量算得对不对、工具能不能真的被调起来。用 testkit 而不是全手工装配，是因为它的 README 明说「测试仍然负责适配器」，这次被测的东西正好留在外面。
- **协议**只挂 `LlmRuntime`，直接读 `ctx.llm.stream()`，不经过 agent，断言最短。故意写错的流、抛错规范化、带内故障、`UNSUPPORTED_OPTION`、`EMPTY_RESPONSE`、中途取消都在这一组。
- 剩下三组管**能力声明、注册语义、拦截层**。注册那组把平时遇不到、遇到又难查的规矩钉住了，同一个路由不能有两个适配器，`replace()` 换路由是原子的，释放之后再换抛 `REGISTRATION_DISPOSED`。

有一条心得值得单独说，**凡是「框架保证 X」的说法，都值得配一条会让它失败的用例**。

```ts
const failure = await ctx.llm
  .prepareCall({ provider: 'scripted', model: 'demo', reasoningEffort: ReasoningEffortId('extreme') })
  .then(() => undefined, (error: unknown) => error as { code?: string })
expect(failure?.code).toBe('UNSUPPORTED_REASONING_EFFORT')
expect(adapter.requests).toHaveLength(0)   // 连 stream 都没进来
```

拦截层那组的核心也一样，命中时不能只说「返回了拒绝文本」，还要证明**适配器一次都没被调到**。

## 工程上还有三处现实的坑

**线协议会变，产物得跟着重生成。** reply-tips 那个双端包提交前突然启动失败，报的是参数编码器没有 `create()` 工厂。翻 harness 的提交记录才知道，上游当天把边界编码器从「直接给 schema」改成了「首次使用时才物化的 create 工厂」，我的产物是几天前生成的，字段还是旧名字。跨仓库的生成物没有版本约束，上游一动就得重跑生成脚本。

**配置分层会压过你的配置。** 我在 patch 里把默认模型指向离线提供方，跑起来回答我的却是真模型，因为 `~/.dsh/settings.yaml` 里早存了用户的模型选择，settings 是叠在组合配置之上的用户层。csv-query-tool 那篇讲过的配置分层，这次从另一个方向又咬了我一口。离线演示之所以自带一次性 `DSH_HOME`，就是为了绕开这一层，谁的真实环境都不动。

**patch 里的路径锚点跟我以为的不一样。** 仓库文档一直写「相对 profile 目录解析」，我就照着写 `./examples/<项目>/src/index.ts`，启动报的却是 `<项目目录>/examples/<项目>/src/index.ts`。实测下来**锚点是声明这一行的 patch 文件所在目录**。只有放在 profile 目录里那份 `cordis.patch.yml` 才按 profile 目录解析，那份才需要 examples junction。这个坑我顺手把仓库里九个 patch 和六组 README 全改了过来。

## 接下来该干嘛

这个提供方是进程内的，不解析任何厂商协议。往上一层可以换成真的 wire 适配器，对着 `packages/test-support/llm-mock-server` 写 HTTP 与 SSE，练请求映射、`attributionHeaders()` 和重试分类。`llm/stream` 这条瀑布也才用了一小半，超时、脱敏、用量计量都没做过。

另一条路是往上游走，看提示词那一层。`ctx.systemPrompt` 也是带提供方角色的 seam，管系统提示词怎么拼起来，跟模型边界正好是一件事的两端。

**这一篇记住一句话就够用了，分片契约不是文档承诺，是有代码在查的。**
