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

### 剧本怎么推导

适配器把请求交给 `src/script.ts`，那里是一个纯函数：从 `GenerateOptions.messages` 里读最后一条人类消息，按剧本文法得出本轮要说什么。真适配器在这一步解析厂商的 SSE 流，我们解析剧本，所以整个示例离线可跑。

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

两条路径的差别只在适配器这一侧；对消费方来说结果一致。本示例两种都实现了，测试分别断言：`fail:` 剧本抛 `RATE_LIMIT`，`provider-fail:` 剧本直接收流成 error finish，中途 abort 则由运行时按 `signal` 归类成 `aborted`。

### 能力声明与注册

`resolveModel()` 声明的东西会被真实校验。声明了 reasoning 能力时，选项按适配器给的有序不透明 ID 原样透出，包括 `off`；调用方显式指定了不支持的强度，`LlmRuntime` 会在调用 `stream()` **之前**拒绝，测试用「`stream()` 一次都没被调用」把这条钉住。省略强度时会落到适配器声明的默认值。

注册的规矩也值得记住。同一个 route 只能有一个适配器，重复注册抛 `DUPLICATE_ADAPTER`；一次注册多个 route 要么全成要么全败；注册返回的句柄除了注销，还有一个 `replace()` 能原子换路由，先整体校验再同步置换，中途没有空窗；句柄释放之后再 `replace` 抛 `REGISTRATION_DISPOSED`。注册本身是副作用，跟着插件生命周期自动回收，所以 HMR 安全。

## 剧本文法

最后一条人类消息的开头决定这一轮说什么。

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

14 条，分四组，看的是真实边界而不是内部实现。

- **端到端**（挂 `agent-loop-testkit` 的先决依赖 + 生产 AgentLoop）：文本回合装配出助手消息与用量，并钉住「会话里记的是打包后的流」；工具调用回合跑两轮，参数保持原始 JSON，工具结果回到模型；harness 注入的 user 消息不会被当成人类指令。
- **流协议与故障**（直接读 `ctx.llm.stream()`）：块顺序与 index；故意写错的流被包不变量拦下；抛错规范化；带内故障；`UNSUPPORTED_OPTION`；`EMPTY_RESPONSE`；中途 abort。
- **能力**：显式指定不支持的 reasoning 强度时 `stream()` 不被调用；省略时落到默认值；目录外的模型 id 依然接受。
- **注册**：重复注册、`replace()` 原子换路由、`REGISTRATION_DISPOSED`。

## 已知限制

- 本示例不解析任何厂商协议，也就不涉及 HTTP 请求映射、`attributionHeaders()`、SSE 解析与重试分类。想练那一层，可以把剧本换成 `packages/test-support/llm-mock-server`（OpenAI 兼容的故障服务器）指向的 base URL。
- `listModels()` 只做展示，尚未验证 web 的模型选择器是否消费它；web 里的验证方式是挂上 patch 后在模型选择器里找 `Scripted (scripted)`。
- 剧本模型不做任何真实推理，`usage` 是按消息条数与字符数推算的，别拿它做计量实验。

## 怎么分发

本示例按教学示例交付，不带 `package.json`，不参与 bundle 通道。要做成可安装包（`package.json` 声明 `dsh.bundle.patch`、自带 `cordis.patch.yml`、预构建 `lib/`）的完整流程见 [docs/plugin-package.md](../../docs/plugin-package.md)，现成的两个样板是 [grill-send-button](../grill-send-button/) 与 [reply-tips](../reply-tips/)。
