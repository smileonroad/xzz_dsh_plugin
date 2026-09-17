# 提案：scripted-llm-adapter —— 给 harness 接一个不用联网的模型提供方

> 日期 2026-09-17。状态：**已完成**（P1 + 小的拦截图层）。
> 前置实战：`examples/reply-tips/`（Client + Host 双端标准包 + Typert 线协议）已收尾并提交。
> 本文按「为什么做 → 总体流程 → 实现方案 → 问题」的顺序写，先讲人话再落技术细节。
>
> 交付与验证（2026-09-17）：`examples/scripted-llm-adapter/`（`src/` 五个文件、21 条测试、`cordis.patch.yml`、`scripts/demo.mjs`、双语 README），`notes/2026-09-17-scripted-llm-adapter.md` 一篇。测试 21/21 通过；离线演示三条路径实测（正常回显、命中门禁拒绝、工具结果回传）都不联网不要密钥。开发期新增的三个发现记在笔记的「工程上还有三处现实的坑」，其中 patch 锚点那条把仓库里九个 patch 与六组 README 一并改正了。

## 一、这次练什么

一句话，**给 harness 换一个模型提供方**，而且这个提供方不联网、不要密钥、输出完全可预测。

干这件事的东西叫 **LLM 适配器**（LLM adapter）。它的角色像同声传译。harness 内部只认一门语言，叫「规范分片流」，模型说的话必须以规定好的分片形式流回来；而每个厂商（DeepSeek、其他 OpenAI 兼容服务、内部模型）说的都是自家那门语言。适配器站在中间，进去时把 harness 的请求翻成厂商的请求，出来时把厂商的响应翻回规范分片。

我们这次的「厂商」是自己写的剧本模型，整个过程完全离线，所以**任何人都能一键复现**，不需要 API key。

## 二、为什么排到这里

到目前为止，这个仓库练过的插件，可以按「插进内核的哪一层」排一遍。

| 插在哪一层 | 服务键 | 对应实战 | 练到的是什么 |
| --- | --- | --- | --- |
| 人敲的斜杠命令 | `ctx.commands` | helloworld-command | 命令不是工具，不烧 token |
| 模型能调用的工具 | `ctx.tools` | sql-check-tool / csv-query-tool | 工具契约与配置分层 |
| 插件之间的能力 seam | `ctx.units` | units-capability | 定义 / 提供方 / 消费方三角色 |
| 插件之间的事件 | `ctx.on` / `ctx.emit` | events-demo / tea-shop-demo | 服务是伸手要，事件是喊一嗓子 |
| 审批应答 | `approval/request` | gatehouse-demo | 策略可以代替人作答 |
| 界面 | `ctx.slots` / `ctx.remote` | laundry-demo / grill-send-button / reply-tips | 会话节点、输入栏、双端 Remote |

把这张表从头看到尾会发现一件事。上面每一层，最后都踩在同一条地基上 —— **模型那一轮调用到底是怎么发生的，以及模型说的话是怎么流回来的**。工具要等模型决定调用，事件里的内容多半来自模型输出，界面渲染的是模型的产物。可这条地基我们一次都没亲手搭过，一直是它在背后默默工作。

再看官方教程的路线图，`docs/user/develop/practice/index.zh.md` 的「下一步」只剩一条，就是 `llm-adapter.zh.md`。教学素材、仓库现状、官方推荐，三边指向同一个点，所以这一篇就做它。

还有一层考虑是角色互补。units-capability 那篇我们自造了一条 seam，练的是「怎么设计一条能力 seam」；这次接的是**内核既有的 seam**，练的是「怎么给已经存在的 seam 当提供方」。同一个三角色模型，换一个视角看。

## 三、总体流程：一次模型调用到底发生了什么

这部分是理解整件事的关键。先把完整链路画出来，再逐段拆。

```
agent loop 决定「该问模型了」
        │
        │ 组装 GenerateOptions（历史消息、系统提示词、工具 schema、生成参数、signal）
        ▼
   ctx.llm.stream(options)
        │
        │ ① 走 llm/stream 瀑布，插件可以在这里包一层或看一眼
        ▼
   选定路由：options.provider 决定找哪个适配器，options.model 是厂商模型 id
        │
        │ ② adapter.prepareCall() → resolveModel()（身份 + 上下文窗口 + reasoning 能力）
        ▼
   adapter.stream(options)  ← 我们要实现的就是这个方法
        │
        │ ③ 产出规范分片：block-start / text-delta / tool-call-delta / block-end / usage / finish
        ▼
   装配器把分片拼成一条完整的 assistant 消息
        │
        ├─ 如果模型要求调工具 → 工具执行 → 结果作为新消息塞回历史 → 回到最上面再来一轮
        └─ 否则 → 本轮结束，消息进会话
```

**① 入口只有一个。** agent loop、上下文压缩、会话起标题，这些看起来八竿子打不着的功能，都走 `ctx.llm.stream(options)` 这同一个入口（`packages/llm/llm/src/index.ts:336` 的 `LlmRuntime`）。这也解释了为什么适配器写错会连带一串功能出问题。

**② 先问能力，再发请求。** `prepareCall()` 的默认实现做两件事，先 `resolveModel()` 问清楚「这个 provider/model 是什么、上下文多大、支持哪些 reasoning 强度」，再返回一个绑定了「这一代适配器」的 stream 入口（`index.ts:267-283`）。绑成一个原子对是为了防止动态目录型适配器在两次查询之间换了配置，导致「用 A 代的能力」去发「B 代的请求」。

**③ stream 是唯一必须实现的方法。** `LlmAdapter` 是个抽象类，`providerInfo` / `listModels` / `resolveModel` / `prepareCall` 全都有默认实现，只有 `stream(options): AsyncIterable<StreamChunk>` 是抽象的（`index.ts:203-283`）。分片一共七种，但归起来只有三件事 —— 三种内容块（文本、思考、工具调用）、每块的启停与内容、以及收尾的用量和结束原因。块之间靠 `index` 关联，同一块的每次增量复用同一个 `index`，最后由 `block-end` 一次性交出拼好的整块。

**④ 顺带说清两条错误路径，这是最容易记反的地方。** 适配器遇到传输或协议故障，可以**直接抛**（抛 `LlmError`，带一个稳定的机器可读 code）；遇到提供方「带内故障」，也可以**以 `finish { kind: 'error' | 'aborted' }` 收流**。但对消费方来说结果是一样的，因为 `LlmRuntime.stream()` 会把抛出的异常**规范化**成终态 finish 再交出去（`packages/llm/llm/src/types.ts:415-422` 的契约注释）。也就是说，消费方永远看到 finish，看不到异常。

**⑤ 契约不是建议，是有人查的。** `packages/llm/llm/src/invariant.ts:88` 本身就是一个 `llm/stream` 监听器，而且注册时带 `{ global: true, prepend: true }`，排在所有插件前面。usage 发在 finish 之后、`block-start` 没配 `block-end`、`index` 乱序，这些都会被它拦下。这条事实很有价值，它允许我们**故意写错**，用一次失败来证明约束真的存在，而不是靠文档承诺。

**⑥ 瀑布给插件留了插一脚的位置。** `llm/stream` 是 waterfall 事件，插件可以在适配器外面包一层，做超时、重试、脱敏、日志、缓存。内核自己的 invariant 就是这么干的，可见这不是预留接口，是真实在用的扩展点。

**⑦ 注册的语义比想象中严格。** `registerAdapter(providers, adapter)` 遵守三条规矩，同一个 route 不能有两个适配器（重复注册抛错）、一次注册多个 route 要么全成要么全败、注册返回的句柄除了注销还有一个 `replace()` 能原子换路由（先整体校验，再同步置换，中途没有空窗）。句柄释放之后再 `replace` 会抛 `REGISTRATION_DISPOSED`。注册本身是副作用，跟着插件生命周期自动回收，所以 HMR 安全（`index.ts:291-322`、`:390`）。

**⑧ reasoning 是「有序不透明 ID」。** `resolveModel()` 可以返回一组 reasoning 选项，比如 `off`、`low`、`high`。harness 不解释这些拼写，只把它们当作有序的不透明标识，由适配器负责映射到厂商请求。适配器支持 `off` 就得如实列出来，不能自作主张删掉；显式指定了一个模型不支持的强度，服务会在调用 `stream()` **之前**就拒绝（`docs/user/develop/practice/llm-adapter.zh.md`）。

## 四、实现方案

分五步，每步都尽量让「做了什么」和「为什么这么做」对得上。

开发顺序上，先跑通最小闭环再补契约。也就是说，先把「一个回显型适配器能被 headless 跑起来」打通，确认注册、路由、装配这条链路是通的，然后再回头把分片顺序、错误分流、abort、注册原子性这些契约项逐个补齐并写成测试。这样出问题时能立刻分清是链路没通还是契约写错，而不是一上来就被一堆约束淹没。

### 第 1 步：插件骨架

Cordis 插件的老三样，加上配置。

```ts
// src/index.ts
export const name = 'scripted-llm-adapter'
export const inject = ['llm']
export const Config = Schema.object({ providers: ..., script: ... })

export function apply(ctx, config) {
  ctx.llm.registerAdapter(config.providers, new ScriptedAdapter(config))
}
```

`inject: ['llm']` 保证 `ctx.llm` 就绪才执行 `apply`，这是依赖驱动加载的标准用法（units-capability 那篇讲过）。配置走 Schemastery，理由和 csv-query-tool 那篇一样，用户可以在 cordis.yml 里改，也可以留默认值。注意这里**不要**去读自造的密钥文件，官方手册点名过这一点，需要凭据就走 Schemastery 的环境变量回退。

### 第 2 步：剧本与纯函数

这一步是整个示例的教学设计核心。真适配器解析的是 HTTP/SSE，我们解析「剧本」。`src/script.ts` 是一个纯函数模块，输入是「剧本 + 本次收到的 `GenerateOptions`」，输出是「这一轮该发哪些分片」。

判断规则保持可预测，比如历史里最后一条用户消息是 `tool:ls` 就发一个工具调用块，否则把全文包成 `[scripted] …` 回显。剧本本身支持几种回合类型，普通文本、工具调用、注入失败、故意挂起（用来测取消）。

之所以不直接对着 `llm-mock-server` 写 HTTP 适配器，是因为那样一半精力会花在 SSE 解析和 HTTP 细节上，而这次要教的**规范分片流契约**会被淹没。HTTP 那一层留作可选进阶（见第五节）。

### 第 3 步：适配器本体

`src/adapter.ts`，一个继承 `LlmAdapter` 的类。

- `providerInfo()` 给出提供方展示信息。
- `listModels()` 列出剧本里声明过的模型，让模型选择器能看见（是否真被 UI 消费待验证）。
- `resolveModel()` 返回身份 + 上下文窗口 + reasoning 选项，其中 reasoning 列表原样透出，包括 `off`。
- `stream()` 是重头戏，按契约顺序发分片。文本块是 `block-start` → 若干 `text-delta` → `block-end`，工具调用块用 `tool-call-delta` 传原始 JSON 的增量。收尾统一是 `usage` 然后 `finish`，之后什么都不发。
- 错误按两条路径分流。剧本里标记为「传输故障」的回合抛 `LlmError` 带稳定 code；标记为「提供方带内故障」的回合以 error finish 收流。
- 不支持的字段不静默丢，抛 `UNSUPPORTED_OPTION`。这是官方手册的硬要求，也是最容易偷懒的地方。
- 全程尊重 `options.signal`，挂起剧本要能在 abort 后立刻停稳。

目录分层照着 `packages/llm/llm-deepseek/` 的思路来，协议类型、剧本编译、适配器类各管一段，不糊在一个文件里。

### 第 4 步：零密钥演示

`cordis.patch.yml` 里放两行，一行挂适配器，一行把默认模型指过去。

```yaml
- insert:
    - id: scripted-llm
      name: './examples/scripted-llm-adapter/src/index.ts'
- id: agent-default-model
  config:
    provider: scripted
    model: demo
```

`agent-default-model` 的配置就是 `{ provider, model }`（`packages/core/agent-default-model/src/index.ts`），仓库里 `demo/model.patch.yml` 已经演示过同样手法。这样 `node demo/run-headless.mjs --patch <patch>` 就能跑，不碰密钥、不碰 bootstrap-only 的环境变量。

### 第 5 步：测试

沿用系列哲学，**测试描述行为，不描述正确性**，挂真实服务走真实边界（这次的最外圈是厂商 HTTP，我们本来就没有，所以被测对象天然裸露）。九条分四组。

契约组，钉的是分片顺序与装配结果。文本回合跑完整链路，断言分片顺序和装配出来的消息、usage 都正确。工具调用回合断言增量拼出的参数是原始 JSON 字符串，工具真的被执行，第二轮能拿到工具结果。

故意写错组，钉的是「约束真的存在」。发一个违规剧本（usage 晚于 finish、缺 block-end、index 乱序），断言被 `invariant.ts` 那条监听器拦下。这一组的价值在于，它把文档上的承诺变成了可执行的证据。

错误组，钉的是错误语义。抛 `LlmError` 后消费方看到的是规范化后的终态 finish，且 code 保留；塞一个剧本不支持的字段得到 `UNSUPPORTED_OPTION`；显式指定不支持的 reasoning 强度时，`stream()` 根本还没被调用就已被拒；空响应落到 `EMPTY_RESPONSE`，照抄内核的分类，不自己发明「空就是空」。

生命周期组，钉的是注册与取消。同 route 二次注册抛错；`replace()` 换路由过程中没有请求看到空窗；disposer 之后再 `replace` 抛 `REGISTRATION_DISPOSED`；流中途 abort 后终态是 aborted，挂起剧本及时收尾。

端到端装配优先用 `packages/test-support/agent-loop-testkit`（它的 README 明说「测试仍然负责适配器」，正好就是这次被测的东西），注册语义那几条只依赖 `LlmRuntime`，用最小装配更清楚。

**交付物清单**：`examples/scripted-llm-adapter/` 下的 `src/`（五个文件：适配器本体四个 + 拦截层 `guard.ts`）、`tests/`、`cordis.patch.yml`、`scripts/demo.mjs`、双语 README、`vitest.examples.config.ts`，外加 `notes/2026-09-17-scripted-llm-adapter.md` 一篇，以及 `docs/README.md` 索引与配对表的例行更新。

## 五、已定的决策与待查的问题

### 已定

**范围只做 P1，另加一个小的拦截层。** 进程内确定性适配器 + 测试 + headless 演示 + 笔记。开发中确认了一个真实需求（输入含敏感词就回固定文案、不要调模型），它正好是 P3 里那个 `llm/stream` 拦截图层的入门形态，体量很小（一个 `src/guard.ts` + 五条测试），所以直接并进了本实战，P3 剩下的部分（重试、脱敏、计量的包一层玩法）仍留给以后。往上的 P2 仍然可选，用 `packages/test-support/llm-mock-server`（OpenAI 兼容的故障服务器）把它升级成真 wire 适配器，教 HTTP 请求映射、`attributionHeaders()`、SSE 解析、重试分类。

**装配走 testkit。** 端到端那几条用 `packages/test-support/agent-loop-testkit` 的 `mountAgentLoopTestDependencies` 和 `mountAgentLoopTestHarness`，注册语义那几条只依赖 `LlmRuntime`，用最小装配。选 testkit 的代价是服务组合藏在背后，出问题时定位要靠读它的源码，所以开工第一件事就是把它的实际实现读准（见下）。

**命名用描述性的 `scripted-llm-adapter`。** 系列里的形象名（tea-shop、laundry）留给内容本身有故事可讲的实战，这次的重点是契约，名字就越直白越好。

**交付形态按教学示例走。** 不带 `package.json`，不做 bundle 提升。reply-tips 和 grill-send-button 已经验证过分发通道，需要分发时再单独开一轮。

### 仍需开发期现查

**testkit 的实际接口。** 仓库最近一次提交刚把 Agent 的 inbox 接口合并过（`port the helloworld stub to the merged Agent interface`），testkit 的 README 可能滞后于源码，要以 `packages/test-support/agent-loop-testkit/src/` 为准。

**`resolveModel()` 返回的元数据结构。** 照 `packages/llm/llm-deepseek/` 或 `packages/test-support/llm-replay/` 的最小实现抄，字段别自己发明。

**「不支持的显式 reasoning 强度在 stream 之前被拒」发生在哪一层。** 这条决定了测试断言该打在哪，读代码确认后再写测试。

**web 模型选择器是否消费 `listModels`。** 消耗小就顺手把演示做到 web，消耗大就只做 headless 演示，并把这个限制如实写进笔记。

## 六、验证方式

分三层，一层比一层接近真实运行环境。

第一层是单元测试，在 harness 根目录跑 `pnpm exec vitest run --config examples/scripted-llm-adapter/vitest.examples.config.ts examples/scripted-llm-adapter`。调试时加 `--disableConsoleIntercept --silent=false` 透传 console，这是系列老规矩。

第二层是端到端演示，把示例拷进 harness 的 `examples/` 目录后，用 `demo/run-headless.mjs` 带 patch 跑一条任务，检验「注册 → 路由 → 分片 → 装配 → 落会话」在真实 agent loop 里成立。

第三层是人工确认，重启 dsh web 看这个提供方是否出现在模型选择器里。这一层是加分项，取决于第五节提到的未知项，做不了就如实写进笔记的「已知限制」。

收尾照系列惯例走一遍，README 双语同步并重记 `README.i18n.yaml` hash，`docs/README.md` 的实战表与笔记表各加一行，笔记按 `notes-writing-style.md` 定稿后通读。

## 七、没选的候选，及原因

| 候选 | 为什么这次不做 |
| --- | --- |
| `ctx.systemPrompt` 提示词分段 | 单点太小，撑不起一篇，更适合当某个实战的配菜 |
| `ctx.sessionPersistence` 可替换持久化 | 体量大但偏管线，教学收益集中在格式演进上，可读性差 |
| `ctx.skills` provider | 与已有的 dsh-skill 笔记重叠较多，官方素材也更少 |
| `tools/pre-execute` 的守门、包裹、后处理 | events-demo 已经把这条瀑布的观察者和决策者两种角色练过了 |
| MCP、subagent、plan-mode | 都不是「一条新 seam 的契约」，更像组合玩法，适合排在模型边界之后 |
