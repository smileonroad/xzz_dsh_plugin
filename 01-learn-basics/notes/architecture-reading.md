# 架构文档带领阅读

> 逐段精读 `docs/architecture.md`（160 行）的学习笔记。
>
> 每段给：原文关键句 → 白话解释 → 代码佐证 → 易踩坑的点。
>
> 配套文档：[TypeScript 项目开发基本知识](typescript-basics.md)

---

## 目录

- [全文结构地图](#全文结构地图)
- [前置：三种事件分发模式](#前置三种事件分发模式)
- [导言](#导言l17)
- [一、Cordis](#一cordisl913)
- [二、Profile 与组合包](#二profile-与组合包l1539-本节最重要)
- [三、应用启动](#三应用启动l4147)
- [四、桌面应用](#四桌面应用l4953)
- [五、核心包](#五核心包l5568你的第一张地图)
- [六、事件](#六事件l7078三个事件域)
- [七、轮次流程](#七轮次流程l80113-全文最难)
- [八、会话日志](#八会话日志l115123-第二难)
- [九、能力 seam](#九能力-seaml125131)
- [十、新行为的归属位置](#十新行为的归属位置l133160)
- [全文总结](#全文总结)
- [附录 A：可逆副作用](#附录-a可逆副作用)
- [附录 B：自测题](#附录-b自测题)

---

## 全文结构地图

| 行 | 章节 | 讲的是 |
|---|---|---|
| 1–7 | 导言 | 阅读前提 |
| 9–13 | Cordis | 底层框架是什么 |
| 15–39 | Profile 与组合包 | **静态结构**：插件树怎么拼出来 |
| 41–47 | 应用启动 | 入口只有 `dsh` CLI |
| 49–53 | 桌面应用 | Electron 的特殊装配 |
| 55–68 | 核心包 | **地图**：谁负责什么 |
| 70–78 | 事件 | **动态行为**：三个事件域 |
| 80–113 | 轮次流程 | ⭐ 全文最难 |
| 115–123 | 会话日志 | ⭐ 第二难 |
| 125–131 | 能力 seam | 可替换性的本质 |
| 133–160 | 新行为归属 | **实操索引** |

---

## 前置：三种事件分发模式

读后半（尤其轮次流程）的必备工具，来自 `docs/cordis-primer.zh.md`：

| 模式 | 是否 await | 分发顺序 | 有返回值 | 语义 |
|---|---|---|---|---|
| `emit` | 否 | 按注册顺序观察 | 否 | **观察**，不干预 |
| `waterfall` | 否 | 环绕中间件 | 是 | **包装/拦截**，需调 `next()` 委托 |
| `serial` | 是 | 按注册顺序 | 是 | **按序执行** |
| `parallel` | 是 | 全部并行 | 否 | 并行扇出 |
| `bail` | 否 | 按注册顺序直到 bail | 是 | 首个 bail 值即停 |

### waterfall 的语义

> 监听器接收 `(...args, next)`。调用 `next()` 会执行下游监听器；**不调用 `next()` 直接返回则短路**。

即：**瀑布是「中间件链」，不是「通知列表」**。监听器可以放行、可以改写、可以完全拦截。

> ⚠️ 这与「可逆副作用」（见附录 A）同源：`waterfall` 的监听器也是通过 `ctx.on()` 注册的，所以也是 effect，插件卸载时自动从链上摘除。

### 速读技巧：看类型签名判断分发模式

```ts
// 有 next 参数 + 返回 Promise → waterfall
'agent/pre-step'(this: Scoped<Agent>, payload: {...}, next: () => Promise<PreStepDecision>): Promise<PreStepDecision>

// 返回 void → emit
'agent/status'(this: Scoped<Agent>, payload: { agent: Agent; status: AgentStatus }): void
```

---

## 导言（L1–7）

> **L5**：Read this before changing anything under `packages/`. It assumes you know Cordis.

这是 `packages/` 的改动前置必读。前提是懂 Cordis —— 不懂就先读 `docs/cordis-primer.zh.md`。

> **L7**：We recommend using an agent to explore the codebase and understand its architecture.

官方建议**用 agent 来探索代码库**。这句话出现在架构文档里挺有意思 —— 这个项目本身规模大到人类线性阅读不划算。

---

## 一、Cordis（L9–13）

> **L11**：Cordis is the framework under dsh: plugins contribute services, typed events, and reversible effects to a shared context.

Cordis 是 dsh 的底层框架。插件向一个**共享上下文**贡献三样东西：

| 贡献物 | 是什么 | 你会看到的写法 |
|---|---|---|
| **services** | 长期存在的对象，挂在 `ctx` 上 | `ctx.sessions`、`ctx.tools`、`ctx.llm` |
| **typed events** | 类型化的事件 | `ctx.on('session/event', ...)` |
| **reversible effects** | 可逆的副作用 | `ctx.effect()`、`ctx.on()` 的返回值 |

> **L11 后半**：Every part of the product is a plugin, including the model adapter, the tool registry, the session log, and the **agent loop itself**, so each is replaceable from configuration.

> **⚠️ 这是理解整个项目的钥匙。** 注意最后一项：**连 agent loop 本身都是插件**。
>
> 这意味着没有「主程序」，只有一个空壳启动器 + 一堆插件。你平时认为「框架核心」的东西 —— 模型适配器、工具注册表、会话日志、甚至跑对话的那个循环 —— 在这里全都可以被替换掉。

> **L13**：There is no privileged core to patch: you extend dsh by mounting a plugin beside the others, and registrations are effects that **unwind when their plugin unloads**.

**没有特权内核可以打补丁**。扩展方式是把插件「挂在旁边」，而不是改进核心。而且注册是**可逆副作用** —— 插件卸载时自动撤销。

**代码佐证** —— `packages/core/session/src/index.ts`：

```ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    sessions: SessionStore      // ← 这就是「向共享上下文贡献服务」
  }
}
```

包自己声明「我往 `ctx` 上加一个 `sessions` 字段」。没有任何中央注册表需要修改。

> 详细展开见 [附录 A：可逆副作用](#附录-a可逆副作用)。

---

## 二、Profile 与组合包（L15–39）⭐ 本节最重要

### 2.1 核心隐喻：插件树 = 分层叠加（L17）

> A running `dsh` is a plugin tree composed at boot from **ordered layers**.

一个运行中的 dsh 是棵**插件树**，由启动时按**顺序叠加的各层**组合而成。

「有序层」是关键 —— 后面的层能覆盖前面的层。这就是为什么叫「patch」。

### 2.2 Profile 是什么（L19）

> A **profile** is a named composition stored in the Harness home. It lists the bundles it stacks, holds any out-of-tree plugins it installs, and keeps the user's own `cordis.patch.yml`.

一个 profile 是**三样东西的打包**：

```
$DSH_HOME/profiles/<name>/
├── 它叠放哪些 bundle（列表）
├── 树外插件（你自己装的）
└── cordis.patch.yml   ← 你本人的覆盖层
```

随发行版交付 5 个模板：`web`、`headless`、`sdk`、`sdk-minimal`、`acp`。

**代码佐证** —— `packages/boot/app-boot/src/profile.ts`：

```ts
export const PROFILE_TEMPLATES: Record<string, ProfileTemplate> = {
  web:  { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'], patchReload: 'live' },
  headless: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'], patchReload: 'startup' },
  // ...
}
```

> 💡 注意 `web` = `base` + `web-app`。所以「Web 版」不是一个独立的程序，而是**共享基础层 + 一个 Web 应用层**的组合。

### 2.3 Bundle 是什么（L21）

> A **bundle** is a distribution format for Cordis config rows and the code they mount, so whatever it inserts stays **patchable by the layers above it**.

bundle 是「配置行 + 它们挂载的代码」的分发格式。关键在**后半句**：bundle 插进去的东西，上层仍然可以 patch。

即：bundle 不是黑盒，它是**可被覆盖的默认值集合**。

> Each declares itself in its own `package.json` under a `dsh` field.

**代码佐证** —— `packages/bundle/base/package.json`：

```jsonc
{
  "name": "@deepseek-ai/dsh-base",
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" }   // ← 指向它的 patch 文件
  }
}
```

而 `packages/bundle/base/cordis.patch.yml`（487 行）长这样：

```yaml
- insert:
    - id: timer
      name: '@deepseek-ai/cordis-plugin-timer'

    - id: hmr
      name: '@deepseek-ai/cordis-plugin-hmr'
      disabled: true          # ← 默认禁用，profile 可开启
      config:
        root: ['.']

    - id: llm
      name: '@deepseek-ai/dsh-llm'

    - id: session
      name: '@deepseek-ai/dsh-session'
    # ...
```

**每一行就是一个插件实例**：`id` 是它的名字（供上层 patch 定位），`name` 是要加载的包。

### 2.4 各 bundle 的分工（L25）

| Bundle | 加什么 |
|---|---|
| `dsh-base` | **共享第一层**：模型适配器、工具、持久化、沙箱与审批策略、设置、凭据、遥测 |
| `dsh-web-app` | 浏览器应用 |
| `dsh-headless` | 无服务器的一次性运行器 |
| `dsh-sdk-app` | SDK JSON-RPC 服务器 |
| `dsh-acp-app` | 仅自动化的 ACP 服务器 |
| `dsh-sdk-minimal` | ⚠️ **例外**：自带完整显式树，**不用** `base` |

`dsh-sdk-minimal` 是刻意的例外，因为它要证明「你不依赖任何共享层也能组装出可用的 dsh」。

### 2.5 层的应用顺序（L27）⭐⭐ 必记

> Layers apply to an empty entry list in this order: each bundle in the profile's listed order, then the profile's `cordis.patch.yml`, then the home-level one, then any `--patch` overlay.

从**空列表**开始，按这个顺序叠：

```
空
 ↓ ① profile 里列出的每个 bundle，按列表顺序
 ↓ ② profile 目录下的 cordis.patch.yml   （你自己的）
 ↓ ③ home 级的 cordis.patch.yml          （整机共享）
 ↓ ④ 命令行 --patch 指定的 overlay        （临时试验）
```

> **A patch targets a row by id and replaces its `whole config`, or inserts new rows.**

> **⚠️⚠️ 这是全文最容易踩的坑。** patch 是**整体替换 config，不是深度合并**。

base 的 patch 文件开头注释写得很明确：

> A patch replaces the targeted row's whole `config` rather than merging into it, so a row whose value differs by mode does NOT live here.

**含义**：如果你只想改 `config` 里的一个字段，必须把**其余字段全部重写一遍**，否则它们会丢。

另一个反直觉点，同一份注释里：

> Row order carries no load semantics (activation is service-availability driven); the grouping is for readers.

**行的顺序不决定加载顺序**。激活时机由「它依赖的服务是否可用」驱动。所以 YAML 里的顺序纯粹是给人读的。

### 2.6 实时重载 vs 启动一次（L29）

> Custom profiles default to live patch reload. The shipped `web` profile is live; `headless`, `sdk`, `sdk-minimal`, and `acp` apply all layers **once at startup** because replacing a one-shot or stdio application's dependencies after it owns work would invalidate that lifecycle.

| Profile | patch 重载 |
|---|---|
| 自定义 profile | **live**（默认，可热改配置） |
| `web` | **live** |
| `headless` / `sdk` / `sdk-minimal` / `acp` | **startup**（只应用一次） |

理由：`headless` 这类跑完就结束的程序，或 `sdk` 这种走 stdio 长连接的，**中途换掉依赖会破坏它自己的生命周期**。一旦开始干活就不能换零件。

### 2.7 实用命令（L33–35）

```sh
dsh --profile web --dump-config
```

> 💡 **这是调试配置的第一把工具。** 它把机器实际会启动的插件树打印出来。

> Any row it prints can be replaced by a patch of your own.

打印出来的每一行，都能用 patch 替换掉。这是验证「我改的 patch 生效了吗」的最快方式。

---

## 三、应用启动（L41–47）

> Every supported Node application starts at the `dsh` CLI with a named profile.

**所有** Node 应用都从 `dsh` CLI 加一个具名 profile 启动。

| 应用 | 等价于 |
|---|---|
| `dsh web` | `--profile web`（刻意保留的别名） |
| `dsh --profile headless` | — |
| `dsh --profile sdk` | — |
| `dsh --profile sdk-minimal` | — |
| `dsh --profile acp` | — |

> custom plugin composition remains a profile plus ordered patch files, **not another executable or inline application tree**.

要定制，就**写 profile + patch 文件**，而不是新写一个可执行文件，也不是在代码里内联一棵树。

> Vendored CLIs, build-only and test-only executables, direct in-process plugin mounting, and the private browser WebWorker preview are **not** Harness application launchers. `verify-application-entrypoints` keeps every package bin, executable source, and root demo in an explicit class and **rejects** a Node application path that bypasses `dsh`.

有一批东西**不算**应用启动器（vendor 的 CLI、只用于构建/测试的可执行文件、进程内直接挂插件、私有 WebWorker 预览）。

> 💡 **值得学的工程手法**：他们没有靠文档和自觉维持这条规则，而是写了 `scripts/verify-application-entrypoints.ts`，把每个包 bin、可执行源码、demo **强制分类**，**拒绝**任何绕过 `dsh` 的启动路径。
>
> **架构约束被固化成可执行检查** —— 这是这个仓库很典型的做法（`package.json` 里有几十个 `verify-*` 脚本，都是同一思路）。

**Python SDK 同架构** —— wheel 里打包的就是普通 `dsh` CLI，默认用 `dsh --profile sdk` 启动。Python 侧只暴露「选 profile + 有序 patch 文件」，不暴露完整的 Cordis 树。

---

## 四、桌面应用（L49–53）

> Electron 桌面应用在**签名资源**中携带精确版本的 dsh 生产运行时。`$DSH_HOME/profiles/desktop` 保留外部插件和指向宿主包的链接；兼容升级**保留插件文件**并刷新链接，无需安装核心依赖。

要点：CLI 和桌面**共享** `$DSH_HOME` 下受支持的产品数据，但可执行包、插件激活、锁文件、包管理器状态**各自独立**。

> Electron 通过内置上游 Node.js 进程启动**私有 Desktop Host 包**；该包加载内置 dsh 后端 + 匹配的客户端图 + 已启用的 profile 插件。

传输通道：

```
renderer  ← dsh-app:// 协议（安全） ← Desktop Host
```

- 一元 RPC、Remote stream、客户端资源 → 走**带版本的分帧字节管道**
- Node IPC → **只**保留给生命周期控制
- ⚠️ **不开放 Web server，不开放 loopback 端口**

> Only shell-owned UI can run plugin transactions through the bundled pnpm and its private `$DSH_HOME/desktop/pnpm/store`.

只有**壳自有 UI** 能通过内置 pnpm 执行插件事务。这是沙箱边界。

---

## 五、核心包（L55–68）—— 你的第一张地图

| 包 | 职责 | `ctx` 键 |
|---|---|---|
| `core/session` | 仅追加的 `SessionEvent` 日志 + 内存存储 | `ctx.sessions` |
| `core/system-prompt` | 提示词片段与工具 schema 组装 | `ctx.systemPrompt` |
| `core/tools` | 作用域化工具注册表 + 带把关的执行流水线 | `ctx.tools` |
| `core/agent` | `Agent` 接口、活跃注册表、`agent/*` 事件 | `ctx.agents` |
| `core/agent-loop` | 实现该接口的**默认驱动器** | `ctx.agentLoop` |
| `core/scope` | 按 agent 划分作用域的注册原语 | **无**（纯库） |
| `llm/llm` | 消息与流式词汇表 + 适配器 seam | `ctx.llm` |
| `webhook/webhook` | 已认证 delivery 分派 + Session 创建 | `ctx.webhookRuntime` |

### 这张表怎么读

1. **第三列是重点**。`ctx` 键 = 这个包往共享上下文挂的名字。想用会话能力，就 `ctx.sessions`。
2. **`core/scope` 没有 ctx 键** —— 因为它是纯库（提供函数），不提供服务。这印证了第九章的 seam 定义：单个角色不构成 seam。
3. **`core/agent` 和 `core/agent-loop` 分开了**。前者是**接口 + 注册表**，后者是**默认实现**。这就是「agent loop 本身是插件」的落地：换成自己的实现，只需替换 `agent-loop` 那一行。

---

## 六、事件（L70–78）—— 三个事件域

> Events are the extension points, and **picking the right domain is the first decision in most changes**.

事件就是扩展点，而「选对事件域」是大多数改动的第一个决定。

> **Session events** are durable facts appended to the log and broadcast through `session/event`. Use one when **the fact must survive a reload**.
>
> **Agent events** (`agent/*`) carry a live `Agent`: inbox, step, status, request, validation, continuation. Use one to **observe or intercept work in flight**.
>
> **Capability events** attach policy and adapters to a seam (`fs/*`, `tools/*`, `telemetry/*`) **without importing the loop**.

### 决策表

| 域 | 判据 | 生命周期 | 例子 |
|---|---|---|---|
| **Session** | 这个事实**重载后必须还在**吗？ | 持久（进日志） | `user/message`、`tool/result`、`turn/start` |
| **Agent** | 我要**观察或拦截进行中的工作**吗？ | 实时（进程内） | `agent/pre-step`、`agent/request`、`agent/status` |
| **Capability** | 我要给某个 **seam 挂策略/适配器**吗？ | 实时（进程内） | `tools/pre-execute`、`fs/*`、`telemetry/*` |

**代码佐证** —— `packages/core/agent/src/runtime-types.ts` 集中声明了 `agent/*` 事件：

```ts
'agent/pre-step'(this: Scoped<Agent>, payload: {...}, next: () => Promise<PreStepDecision>): Promise<PreStepDecision>
//                                          ^^^^ 有 next → 是 waterfall
'agent/status'(this: Scoped<Agent>, payload: { agent: Agent; status: AgentStatus }): void
//                                                           ^^^^ 返回 void → 是 emit
```

`tools/*` 系列有显式 `@mode` 标注：

```ts
/**
 * Allow, deny, or ask before dispatch. `next()` delegates to allow; missing
 * approval support turns `ask` into denial.
 * @mode waterfall
 */
'tools/pre-execute'(...): Promise<PreToolDecision>
```

> **"without importing the loop"** —— 能力事件的价值在于**解耦**：写个文件系统策略插件，不需要 import agent-loop 的任何东西。

---

## 七、轮次流程（L80–113）⭐ 全文最难

### 7.1 两个基础定义（L82）

> A **step** is one model request plus the tools it calls. A **turn** is zero or more steps: it opens before its first input is claimed and closes once nothing is owed.

```
turn（轮次）= 0..N 个 step
step（步骤）= 1 次模型请求 + 它调用的那些工具
```

- **一次模型请求 = 一个 step**
- 模型调了工具 → 工具结果要回喂 → 又一个 step → 同一个 turn 内
- 模型不再调工具 → turn 结束
- **turn 可以是 0 步**（输入被拒、输入为空）
- turn 的生命周期边界：**领取首条输入之前打开**，**不再欠任何工作时关闭**

### 7.2 流程图逐行注解（L84–103）

```text
turn/start
```
🔹 **持久会话事件**。开启轮次，带 `turn` 编号。此刻还没领取任何输入。

```text
  claim next-step input plus one queued message
```
🔹 从 **inbox** 领取输入。「plus one queued message」—— 一次领一条排队消息。

```text
  assemble prompt sections + tool schemas; project runtime context
```
🔹 **组装阶段**。三件事：
- `prompt sections` → 提示词片段（各插件贡献的）
- `tool schemas` → 工具的模式定义（喂给模型）
- `project runtime context` → 运行时上下文投影

> ⚠️ 这一步发生在 `step/start` **之前**，是为下面 `agent/pre-step` 的决策做准备的。

```text
  -> agent/pre-step                   reject | enter(messages, startsRequestSeries?)
```
🔹 **第一个决策点**。waterfall 事件：

```ts
'agent/pre-step'(this: Scoped<Agent>, payload: {...}, next: () => Promise<PreStepDecision>)
```

两种决策结果：
- `reject` —— 拒绝这批输入
- `enter(messages, startsRequestSeries?)` —— 接纳，可改写消息；可选地声明「开启新的请求序列」

**这是 agent 扩展最重要的事件之一** —— 所有「输入改写/过滤」类插件都挂在这里。

```text
     reject, or a first enter rewritten empty -> close the turn with no step
```
🔹 拒绝，或第一次 enter 被改写成空 → **关闭 turn，不产生 step**。这就是「turn 包含**零个** step」的落地。

```text
     step/start
```
🔹 **持久事件**。step 正式开始。

```text
     agent/request -> prepareCall (cancellation commits neither system nor users)
```
🔹 **第二个 waterfall 决策点**，用于选择模型路由（哪个 provider、哪个 model）。实际用途见 `packages/core/agent/src/model-selection.ts`。

> ⚠️ **括号里那句很关键**：这个阶段是**异步**的，如果在这期间被取消，**系统和用户消息都不提交**（原子性）。

```text
     reconcile system/message using the prepared call capability
```
🔹 用**已准备调用的能力**（capable / incapable route）来协调系统提示词。

```text
     append entered messages as user/message; log request/header and request/context as needed
```
🔹 把接纳的消息作为 `user/message` **持久事件**追加；按需记录 `request/header` 和 `request/context`。

```text
     derive and freeze model history from the log
```
🔸🔸 **这一行是整份架构文档的核心。**

「**从日志派生并冻结**模型历史」—— 注意不是「构造请求」，是「**derive from the log**」。

发给模型的消息历史，**不是**在内存里维护一个数组然后发出去，而是**每次都从会话日志重新投影出来**。详见第八章。

```text
     stream the bound prepared call -> llm/stream -> agent/assistant-stream start
       agent/assistant-stream chunk*
       assistant/message | assistant/attempt -> agent/assistant-stream end
```
🔹 **流式阶段**，三帧结构：

| 帧 | 性质 |
|---|---|
| `start` | 进程本地 |
| `chunk*` | **瞬态**（transient），不落盘 |
| `end` | 进程本地 |

收尾时二选一：
- `assistant/message` —— 成功，**进模型历史**
- `assistant/attempt` —— 失败/重试/取消，**仅日志，不进模型历史**

```text
     tool/call* -> tools/pre-execute -> tools/execute -> tools/post-execute -> tool/result*
```
🔹 **工具流水线**。三个 waterfall：

```
tools/pre-execute   →  allow / deny / ask      （准入决策）
tools/execute       →  环绕中间件（超时、重试、指标）
tools/post-execute  →  accept / replace / block（结果处理）
```

> ⚠️ 注意首尾：`tool/call*` 和 `tool/result*` 是**持久会话事件**，中间三个是**实时扩展点**。即「调用和结果落盘，拦截过程不落盘」。

```text
     step/end
     tools owe another request, or next-step input arrived -> claim -> next step
```
🔹 **循环条件**（step → step 的唯一路径）：
- 工具还欠一次请求（模型要接着看工具结果）
- **或**新的输入到了

满足任一条 → 回到 `claim` → 下一个 step。

```text
  -> agent/turn-stopping
```
🔹 **串行事件**：

```ts
'agent/turn-stopping'(this: Scoped<Agent>, payload: {...}): Promise<void> | void
```

> ⚠️ **没有 `next`，所以不是 waterfall**。它是「轮次即将停止」的通报，监听器不能委托。

```text
turn/end
```
🔹 **持久事件**，带 `TurnEndReason`。

### 7.3 哪些持久、哪些实时（L105）

> `turn/*`, `step/*`, `system/message`, `user/message`, `assistant/message`, `assistant/attempt`, and `tool/*` are **durable session events**; the rest are **live extension points across three domains**.

```
turn/start          ██ 持久
  step/start        ██ 持久
  agent/pre-step    ░░ 实时 (waterfall)
  agent/request     ░░ 实时 (waterfall)
  system/message    ██ 持久
  user/message      ██ 持久
  llm/stream        ░░ 实时 (waterfall)
  agent/asst-stream ░░ 实时 (emit，进程本地)
  assistant/message ██ 持久
  tool/call         ██ 持久
  tools/pre-execute ░░ 实时 (waterfall)
  tools/execute     ░░ 实时 (waterfall)
  tools/post-execute░░ 实时 (waterfall)
  tool/result       ██ 持久
  step/end          ██ 持久
  agent/turn-stopping ░░ 实时 (serial)
turn/end            ██ 持久
```

> `agent/assistant-stream` publishes process-local start, transient chunk, and end frames. The loop commits the complete compact stream as one message or log-only attempt **before** a committed end frame.

`agent/assistant-stream` 是**进程本地**的，唯一远程消费方是 **Web Session-follow adapter**（浏览器实时看模型打字那个功能）。

> `agent/pre-step`, `agent/request`, `llm/stream`, and the three `tools/*` events are **waterfalls**, whose listeners **must call `next()`** to delegate; `agent/turn-stopping` is **serial** and has no `next()`.

> **⚠️ 实操中最容易写出 bug 的地方**：如果在 `agent/pre-step` 上注册了监听器却忘了调 `next()`，**整个 agent 就卡死了** —— 因为下游（包括内置行为）永远不会执行。

cordis-primer 的规则：

> 策略监听器在拥有决策权时可以不调用 `next()` 直接返回，而仅做**标注或观察**的监听器则**必须委托**。

### 7.4 Inbox（L107）

> Input reaches the driver through **one inbox**. Some messages wake it immediately; **injected context waits in the inbox until another message does**.

所有输入走**唯一一个** inbox。两类消息行为不同：

| 类型 | 行为 |
|---|---|
| 用户消息 / 唤醒类 | **立即**唤醒驱动器 |
| `agent.inject()` 注入的上下文 | **待命**，等另一条消息来唤醒 |

后半句解释了「添加模型可见上下文 → 调用 `agent.inject()`；它会落到下一次**获准的**请求中」。注入不是立刻发送，是**排队等下一次有真实输入时搭车**。

实现见 `packages/core/agent-loop/src/inbox.ts`，有 4 个 `agent/inbox/*` 事件：

```ts
'agent/inbox/inserted'    // 插入
'agent/inbox/claimed'     // 被领取
'agent/inbox/discarded'   // 被丢弃
'agent/inbox/spliced'     // 持久事件（inbox 状态进日志）
```

### 7.5 最密的一段（L109）逐句拆

**① 准入决策与空轮次**
> `agent/pre-step` decides the accepted input. Listeners may rewrite or reject claimed messages; a rejected or **empty first claim** closes a durable turn without a step.

**② 请求序列声明**
> An enter decision may set `startsRequestSeries`: the loop logs a fresh `request/header` (reason `series`, or `change` with `startsSeries: true` when the envelope also changed).

`request/header` 是「这次请求的信封」（模型、参数等）。`startsRequestSeries` 决定是**新开一个序列**还是**延续**。

> Wrapping listeners preserve that declaration with `{ ...decision, messages }`.

> ⚠️ **包装监听器必须用展开运算符保留这个字段**。如果写成 `return { messages }` 就把它丢了。

**③ 路由解析的原子性**
> After assembly and `step/start`, `agent/request` and `prepareCall()` resolve the actual route **before** the system prompt and accepted users are committed; cancellation during either async phase commits **neither**.

路由解析是异步的。在它完成前取消 → **系统提示词和用户消息都不写日志**。要么全写，要么全不写。

**④ 能力决定提示词准入**
> The prepared call capability governs prompt admission, **not** the preceding `request/context`.

**⑤ 每次尝试的固定动作**
> Every attempt **synchronously** reconciles the same rendered assembly, appends users **only on the first attempt**, logs header/context as needed, and derives and freezes the request before streaming the bound call. **Retries do not repeat assembly or `agent/pre-step`.**

| 动作 | 首次 | 重试 |
|---|---|---|
| 组装（assembly） | ✅ | ❌ 不重复 |
| `agent/pre-step` | ✅ | ❌ 不重复 |
| 追加用户消息 | ✅ | ❌ 不重复 |
| 调和 assembly / 派生冻结请求 | ✅ | ✅ 每次同步做 |

**这是「重试不产生重复用户消息」的保证机制。**

**⑥ 恢复与序列**
> Surface replacements after attachment start a **new request series**, including during the first resumed pre-step; **unchanged resume continues the series**.

**⑦ 系统提示词的节点语义**
> The first admitted step **reserves the system head** before user messages even for an empty prompt (no wire message).

> ⚠️ 即使提示词为空，也要**先占住「系统头节点」的位置**。占位 ≠ 发消息（`no wire message`）。

**⑧ 提示词只走 `system/message`**
> The prompt travels **only** as `system/message` history.

| 情况 | 行为 |
|---|---|
| 渲染结果为空 | **清空所有生效的系统节点**，模型看不到旧提示词 |
| capable route（支持缓存前缀） | 可在**缓存前缀之后追加**非空更新 |
| incapable route / 新序列 | 把非空提示词**归并到第一个系统节点**，后续非空节点**记为空的替换**，从而失效 |

设计意图：**保证「旧提示词绝不会残留为模型可见」**。靠的是「节点替换」这套机制。

### 7.6 不可变请求 + 实时取消（L111）

> The loop sends **immutable requests** while keeping **cancellation live**. It reuses message-freeze provenance only for identities it has **fully frozen**.

请求对象一旦发出就冻结（不可变），但取消信号是活的。冻结证明（freeze provenance）的复用以「该对象**确实被完整冻结过**」为前提 —— 防止复用了没冻结好的对象。

---

## 八、会话日志（L115–123）⭐ 第二难

### 8.0 先破除误解：日志里**没有**聊天记录

你的直觉可能是：会话日志 = 把聊天消息存起来，模型要历史就去读它。

**完全反了。**

| | 直觉以为的 | 实际 |
|---|---|---|
| 日志存的是 | 消息 | **事件** |
| 模型消息在哪 | 存在日志里 | **不在日志里，每次算出来的** |
| 日志的作用 | 存档 | **唯一真源（single source of truth）** |

> The session log is **the source** of the context the model sees. `deriveMessages()` **projects** model history from it.

**不是「从日志里读消息」，是「从日志里投影出消息」。**

### 8.1 银行流水类比

| 银行 | 本项目 |
|---|---|
| **流水账**（存入 100、取出 30、存入 50…） | **会话日志**（事件序列） |
| **余额**（120 元） | **模型消息历史** |
| 余额**不单独存**，需要时**拿流水算** | 消息历史**不单独存**，需要时**从日志算** |
| 流水**只追加**，错了不能撕掉，要记一笔冲正 | 日志**只追加**，从不删改 |
| 同一份流水可以算出不同视图（余额/月报/对账单） | 同一份日志可以投影出历史/转写/遥测 |

**为什么银行不直接存余额？** 因为存了余额就要维护「余额和流水一致」，一旦不一致就完了。只存流水，余额永远是对的。

**为什么这里不单独存消息历史？** 同理 —— 如果日志和消息历史各存一份，两者一旦不同步，模型看到的上下文就是错的，而这**无法检测**。

### 8.2 日志长什么样

一次「用户让我读 README」的对话（示意）：

```
seq  事件类型              内容                       会产生模型消息吗？
─────────────────────────────────────────────────────────────────────
 0   turn/start         {turn: 1}                        ❌ 不产生
 1   step/start         {turn: 1, step: 1}               ❌ 不产生
 2   system/message     "你是 DeepSeek Harness…"          ✅ 系统消息
 3   user/message       "帮我看看 README"                 ✅ 用户消息
 4   tool/call          read_file("README.md")            ❌ 不产生
 5   tool/result        "<文件内容…>"                      ✅ 工具结果
 6   assistant/message  "这个项目是…" + 完整流            ✅ 助手消息
 7   step/end           {turn: 1, step: 1}               ❌ 不产生
 8   turn/end           {turn: 1, reason: "done"}        ❌ 不产生
```

> ⚠️ **注意关键点**：日志里 9 条事件，但模型只应该看到 4 条消息（seq 2、3、5、6）。
>
> 所以立刻产生了问题：**系统怎么知道哪些事件该变成消息、哪些不该？** 答案就是「可见面」。

### 8.3 核心机制：可见面（surface）

**定义**：**surface（可见面）** = 日志中那些**会产生模型消息**的事件，按顺序排成的序列。

只有 **4 种事件类型**能上可见面：

```ts
export type SurfaceEventType =
  | 'system/message'
  | 'user/message'
  | 'assistant/message'
  | 'tool/result'
```

其他所有事件（turn/step 边界、tool/call、assistant/attempt、inbox 变更…）**都不在可见面上**。

上面的例子，可见面就是：

```
nodes = [2, 3, 5, 6]
         ↑  ↑  ↑  ↑
      system user 工具结果 助手
```

**怎么算出可见面**：每个上可见面的事件都自带一个字段 `surfaceOp`，声明「我是怎么进来的」：

```ts
export type SurfaceOp =
  | 'append'                                    // 加到尾部（正常情况）
  | { op: 'replace'; startSeq; endSeq }         // 替换掉某一段
```

折叠过程就是遍历日志、执行每个事件的 `surfaceOp`：

```ts
// packages/core/session/src/surface.ts（简化）
if (plan.kind === 'append') {
  state.nodes.push(plan.seq)                              // 加到尾部
} else if (plan.kind === 'replace') {
  state.nodes.splice(startIdx, endIdx - startIdx + 1, plan.seq)  // 替换掉一段
}
```

**从可见面算出消息**：

```ts
// packages/core/session/src/index.ts（简化）
deriveMessages(): Message[] {
  for (const seq of surface.nodes) {              // ① 走可见面的节点
    const msg = deriveEventMessage(this.log[seq]) // ② 每个节点投影成消息
    if (msg) this.derived.push(msg)               // ③ 收进结果
  }
  return [...this.derived]
}
```

**整个流程**：

```
日志（全部事件）
   │  按 surfaceOp 折叠
   ▼
可见面（4 种消息类事件的有序序列）
   │  deriveEventMessage 逐个投影
   ▼
模型消息历史
```

### 8.4 为什么要 `replace`？—— 压缩（compaction）

**问题**：上下文窗口有限。对话聊了 200 轮，必须压缩：把前面 100 轮浓缩成摘要。但日志只追加、不能删 —— 怎么「删掉」前面的消息？

**答案：追加一条「替换声明」**。

```
日志（只追加，旧事件永远保留）
────────────────────────────────────────────────
seq  3   user/message      "很长很长的旧对话…"
...
seq 40   assistant/message "很长很长的回复…"
...
seq 41   user/message      "[前 40 条对话的摘要]"     ← 新追加
         surfaceOp: { op: 'replace', startSeq: 3, endSeq: 40 }
                    ↑ 声明：我替换掉 3 到 40 号
```

折叠后：

```
可见面 nodes（压缩前）: [0, 1, 2, 3, 4, ..., 40, 41, 42, ...]
                                  └────── 被替换 ──────┘
可见面 nodes（压缩后）: [0, 1, 2, 41, 42, ...]
                                 ↑ 3~40 从可见面上消失了
```

**结果**：
- 模型看到的：seq 3–40 **没了**，取而代之是 seq 41 的摘要 ✅
- 日志里的：seq 3–40 **原封不动还在** ✅

**为什么这个设计好**：

| 需求 | 如何满足 |
|---|---|
| 模型上下文要能压缩 | 用 `replace` 从可见面移除 |
| 历史不能真的丢（审计/回放/调试） | 日志里**永远保留**原始事件 |
| 模型看到的历史必须可重建 | 重放日志的 `surfaceOp` 即可 |

**一份日志，同时满足「可变视图」和「不可变事实」两个矛盾需求。**

### 8.5 「模型可见即已记录」到底在说什么

> **L121**：Model-visible means logged. Anything that reaches a model request must be **reconstructable from the log**.

既然模型历史是**从日志算出来的**，那么逻辑上必然有：

```
日志里的东西  ⊇  模型能看到的东西
     ↑                    ↑
  可以更多            不能有日志外的
```

**「模型能看到，但日志里没有」这种情况，物理上不可能发生** —— 因为它算都算不出来。

反过来，如果**绕过日志**直接往请求里塞东西：

```ts
// ❌ 错误做法：直接改请求
request.messages.push({ role: 'system', content: '工作目录变成了 /foo' })
```

后果：
- 本次请求模型确实看到了 ✅
- 但日志里没有这条 ❌
- 用户关掉再打开这个会话 → `deriveMessages()` 从日志算 → **这条不见了** ❌
- 模型于是基于「旧的目录」继续工作 → **静默出错**

**正确姿势**：

```ts
// ✅ 正确做法：定义事件 + 从日志渲染
// 1. 在 SessionEventMap 里加类型
interface SessionEventMap {
  'session/cwd-changed': { from: string; to: string }
}

// 2. 追加到日志
session.append('session/cwd-changed', { from, to })

// 3. 在 deriveEventMessage 里写投影规则
case 'session/cwd-changed':
  return { role: 'user', content: `工作目录已切换到 ${event.data.to}` }
```

> This is why a new model-visible input requires a new session event: **extend `SessionEventMap` and render from the log.**

这个不变量有**运行时断言** —— `packages/core/session/src/invariant.ts`。

### 8.6 `assistant/message` 和 `assistant/attempt` 的区别

| | `assistant/message` | `assistant/attempt` |
|---|---|---|
| 何时 | 成功产出 | 失败/重试/取消/流错误 |
| 在可见面上？ | ✅ 是 | ❌ 否 |
| 进模型历史？ | ✅ | ❌ |
| 为什么留着 | — | 调试、成本统计、理解当时为何失败 |

**一个模型回复的「灵魂」在 `stream` 字段里**：

> Each `assistant/message` **embeds** the exact compact timed stream that produced its assembled content.

就是把模型一个字一个字吐出来的完整过程（含时间戳）**内嵌**在事件里。因为**流式过程本身是信息** —— 模型有没有犹豫、思考了多久、哪个 token 开始跑偏，这些对调试和重放都有价值。

> a hard process loss before settlement leaves **no durable attempt stream**

> ⚠️ 如果进程在结算前崩溃，日志里**不会留半截流**。要么完整落定，要么什么都没有。

### 8.7 格式版本迁移（L119）

**问题**：程序升级了，日志格式从 v2 变成 v3。用户磁盘上还有一堆 `session.v2.jsonl`。怎么办？

**三条不同的路径**：

| 操作 | 做什么 | 会写盘吗 |
|---|---|---|
| **stat / list** | 只看**文件头**（目录列表、标题、时间），**不加载事件** | ❌ 不会 |
| **读打开** | 内存里把 v2 转成 v3，返回给调用方 | ❌ **不会** |
| **写打开** | 内存里转换，然后**在旁边写一个新文件** | ✅ 会 |

**关键设计：老文件永不动**

```
转换前：  session.v2.jsonl        ← 老文件
转换后：  session.v2.jsonl        ← 还是老文件，一个字没改
          session.v3.jsonl        ← 新写的，新格式
```

> a write open first encodes, verifies, and **exclusively publishes** the final version-named successor **beside the unchanged source**.

| 英文术语 | 含义 |
|---|---|
| `successor` | 后继文件（迁移后产生的新文件） |
| `beside the unchanged source` | 写在**未改动**的源文件**旁边** |
| `exclusively publish` | 排他发布 —— 防止两个进程同时迁移同一会话写坏 |
| `canonical generation` | 规范世代 —— 同一会话多个文件版本中，程序选**数字最高**的那个 |

**为什么读操作不写盘**：

> **读操作不应该有副作用。**

这是主动的**设计原则**，不是省事：

| 理由 | 后果（如果读也写盘） |
|---|---|
| **读不应有副作用** | 「打开看看」会改用户磁盘 —— 违反最小惊讶原则 |
| **权限** | 只读文件系统、只读挂载下**根本读不了** |
| **并发** | 三个窗口同时打开同一会话 → 三个进程抢着发布 successor |
| **空间** | 用户只想扫一眼列表，却为每个老会话产生一份新文件 |

> ⚠️ **注意**：读打开**照样做完整的格式迁移**（解码 + 迁移链 + 校验），只是结果**只留在内存**、不发布 successor。

**为什么是「相邻链」**：

> each **adjacent migration package owns exactly one `vN -> vN+1` step**

假设要支持 v1–v5：

| 方案 | 需要写的转换逻辑 |
|---|---|
| 大转换 | v1→v5、v2→v5、v3→v5、v4→v5 —— **4 套** |
| **相邻链** | v1→v2、v2→v3、v3→v4、v4→v5 —— **4 个小步骤，可任意组合** |

相邻链的好处：加 v6 时，只需要写**一个** v5→v6，其余组合自动可用。这是**组合性（composability）**。

**文件命名规则**：

| 版本 | 文件名 |
|---|---|
| v0 | `session.jsonl[.zstd]` |
| v1+ | `session.vN.jsonl[.zstd]`（**小写 v**） |

> Committed generation paths are **never renamed, replaced, or deleted**.

已发布的文件**绝不重命名、替换、删除**。只**新增**。这样任何时刻的并发读都是安全的。

### 8.8 投影 seam（L123）

> `dsh-session-projection` owns `ctx.sessionProjections`: registered units **fold committed events incrementally**, host consumers read one typed state with `stateOf()`, and carriers batch cropped client views with `snapshot()`.

| API | 用途 |
|---|---|
| `fold`（增量） | 注册单元增量折叠已提交事件 |
| `stateOf()` | host 侧读一个**类型化状态** |
| `snapshot()` | 载体批量取**裁剪后的客户端视图** |

> A host reader **either requires this service during activation or fails explicitly** when the registry or required key is absent.

> ⚠️ **fail-fast 而非静默降级**：
>
> > Contributors may retain `ctx.inject(['sessionProjections'], ...)` registration **without silently defaulting a missing host value**.
>
> 不允许给缺失的 host 值静默提供默认值 —— **宁可明确失败，也不要一个看似能用但语义错误的默认值**。

### 8.9 会话日志全章串联

```
                     会话日志（唯一真源）
                     = 事件序列，只追加，永不改
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   每次事件带 surfaceOp   非可见面事件            事件内嵌完整流
        │                     │                     │
        ▼                     ▼                     ▼
    可见面（nodes）        仅记账/调试           调试、重放、遥测
        │              不产生模型消息
        │ deriveEventMessage 逐节点投影
        ▼
   模型消息历史  ──►  发给模型
```

**四个必须记住的点**：

1. **日志里存的是事件，不是消息**。消息是每次算出来的。
2. **可见面（surface）决定哪些事件变成消息**，由每个事件的 `surfaceOp` 折叠得出。
3. **`replace` 让历史可压缩**，同时日志里原始事件永不丢失。
4. **模型可见即已记录** —— 想让模型看到新东西，就加新事件类型，不要绕过日志。

---

## 九、能力 seam（L125–131）

### 9.1 seam 的三角色定义（L127）

> A **seam** is a swappable capability with **three roles**: a **Service Definition** declaring the interface, a **Service Provider** implementing it, and a **Consumer** using it, commonly a model-facing tool. A package may combine roles, but **one role alone is not a seam**; adding a capability means **designing all three**.

```
  ┌─────────────────┐
  │ Service         │  声明接口
  │ Definition      │  （通常是 TypeScript interface）
  └────────┬────────┘
           │ 实现
  ┌────────▼────────┐
  │ Service         │  提供实现
  │ Provider        │  （如 fs-local、fs-sandbox）
  └────────┬────────┘
           │ 使用
  ┌────────▼────────┐
  │ Consumer        │  使用方（通常是面向模型的工具）
  └─────────────────┘
```

> ⚠️ **「one role alone is not a seam」** —— 光有一个接口不算 seam，光有一个实现也不算。**必须三者齐备**。

这解释了核心包表里，`core/scope` 为什么标注「库，无 ctx 键」。

### 9.2 seam 的威力（L129）

> Seams are why **one provider swap changes the whole product**. Filesystem and subprocess providers **share one execution world**, so pointing them at a remote sandbox moves **Bash, PTY, and LSP** with them, **with no provider forks**.

传统做法：要让 bash 在远程跑 → fork 一份 bash 工具；要让 PTY 也远程 → 再 fork 一份 PTY；LSP 同……

这个项目的做法：

```
ctx.fs + ctx.subprocess  ──指向远程沙箱──▶  Bash ✓  PTY ✓  LSP ✓
```

**因为它们共享同一个执行世界**，所以换掉 fs 和 subprocess 的提供方，上层三个工具**自动**跟着走了。

> `subagent` 提供方在同一个接口之后同样千差万别，从「新建一个子 agent」到「把轮次委派给另一个产品」。

### 9.3 Agent Teams（L131）

实验性功能，显式启用，在可继续的 subagent 之上叠了持久花名册 + 任务板 + 邮箱。

---

## 十、新行为的归属位置（L133–160）

> New behavior attaches to a **documented extension point**. **Changing the loop itself updates this map.**

> ⚠️ 这是**约束**：如果改动了循环本身，你**必须**回来更新这张表。这是文档的维护契约。

**用法**：先在这张表里找到目标，再动手。

### 10.1 扩展「模型能做什么」

| 目标 | 机制 |
|---|---|
| 添加模型提供方 | 在 `ctx.llm` 上注册适配器 |
| 添加面向模型的能力 | 在 `ctx.tools` 上注册；schema 自动加入提示词组装 |
| 添加模型可见上下文 | 调用 `agent.inject()`，落到下一次获准的请求 |
| 添加持久会话状态 | 扩展 `SessionEventMap`，从日志渲染和回放 |

### 10.2 扩展「在哪执行」

| 目标 | 机制 |
|---|---|
| 添加 shell 执行 | 注册 `ctx.shell` 后端；本地后端通过 `ctx.subprocess` spawn |
| 添加持久化终端 | 注册 `ctx.terminals` 后端 + `dsh-tool-terminal` |
| 添加文件系统访问/策略 | 注册 `ctx.fs` 提供方，或监听 `fs/*` |
| 限制进程 | 使用 `ctx.sandbox` 后端；消费方 spawn 前包装 argv |
| 在新后端存储会话 | 实现 `SessionPersistence`（`create`/`open`/`stat`/`list`/`export`） |

### 10.3 扩展「怎么控制流程」

| 目标 | 机制 |
|---|---|
| 拦截请求、工具或轮次 | 用相应 `agent/*` 或 `tools/*`；`agent/turn-stopping` 停止轮次 |
| 添加用户命令 | 在 `ctx.commands` 上注册；**无需模型轮次**即可分派 |
| 添加后台工作 | 在 `ctx.jobs` 注册；`job_*` 工具收集/停止 |
| 从 webhook 启动 Session | `ctx.webhookRuntime` 注册可信规则 + 提供方适配器 |

### 10.4 扩展「作用域与组合」

| 目标 | 机制 |
|---|---|
| 让某会话有不同能力集 | 组装 agent preset；服务行需 `isolate` realm |
| 把注册限定到单个 agent | 使用该 agent 的 `agent.ctx` |
| 在轮次边界 fork 会话 | `ctx.agents.create({ sessionId, seed, meta: {...} })` |
| 生成会话标题 | 注册唯一的 `ctx.sessionTitle` 提供方 |
| 管理同会话目标 | 使用 `ctx.goals` |

### 10.5 扩展「UI」

| 目标 | 机制 |
|---|---|
| 添加 UI 或编辑器集成 | 驱动 `ctx.agents`，从 `session/event` 渲染 |
| 添加 Web Client Chat 节点 | 注册 `ConversationNodeDefinition` + keyed renderer |

### 10.6 实操指南

`docs/cookbook/extension-cookbook.zh.md` 索引了四篇分步指南：

- 加包：`docs/cookbook/adding-a-package.zh.md`
- 加工具：`docs/cookbook/adding-a-tool.zh.md`
- 加 LLM 适配器：`docs/cookbook/adding-an-llm-adapter.zh.md`
- 加设置卡片：`docs/cookbook/adding-a-settings-card.zh.md`

---

## 全文总结

架构文档讲的就是一句话：**一切皆插件，插件通过可逆副作用挂在共享上下文上，用事件通信，用日志保证模型可见性。**

四个层次：

```
① 组装层    profile + bundle + patch  → 拼出插件树
② 容器层    Cordis：ctx 服务 / 类型化事件 / 可逆副作用
③ 协作层    三个事件域：session（持久）/ agent（实时）/ capability（策略）
④ 不变量层  模型可见即已记录 → 一切都从日志投影
```

**读代码时的三条主线**：

1. **看到一个 `ctx.xxx`** → 去核心包表查是谁提供的
2. **看到一个 `ctx.on('yyy')`** → 看类型签名判断是不是 waterfall（有 `next` 参数）
3. **看到任何模型上下文相关代码** → 问「这是从日志投影出来的吗？」不是的话就是 bug

---

## 附录 A：可逆副作用

> 这是架构文档 L13 那句话的展开。原文：*registrations are effects that unwind when their plugin unloads*。

### A.1 术语对照

| 中文 | 英文原文 | 说明 |
|---|---|---|
| 可逆副作用 | **reversible effect** | Cordis/架构文档的用法 |
| 副作用 | **side effect** | 改变外部状态的计算 |
| 注册 | **registration** | 往某个注册表里加条目 |
| 撤销 / 清理 | **unwind** / **teardown** / **dispose** | 文档用 `unwind`，代码用 `dispose` |
| 释放器 | **disposer** | 清理函数 |
| 生命周期单元 | **fiber** | 一个插件实例的运行时载体 |

### A.2 定义

> **可逆副作用（reversible effect）**：一种**伴随释放器（disposer）**的副作用。它执行时会改变共享状态，同时**返回一个函数**，调用该函数即可把这次改变完整撤销。

关键在 `vendor/cordis/src/fiber.ts`：

```ts
/**
 * Effect body result accepted by `ctx.effect()` and plugin startup.
 *
 * Either a single disposer, a promise of one, or a (possibly async) iterable
 * yielding several — generator effects register each yielded disposer as it
 * is produced.
 */
export type Effect<T = any> = SyncEffect<T> | AsyncEffect<T>
```

即：**effect 的「返回值」就是它的「撤销方式」**。

### A.3 它不是什么

「可逆」**不是**指副作用本身可以被撤销。你没法「撤回」一封已发送的邮件。

Cordis 这里说的可逆，**严格限定在注册/占用类副作用**上：

| 副作用类型 | 可逆？ |
|---|---|
| 往注册表加条目（工具、监听器、适配器） | ✅ 从注册表删除 |
| 占用资源（句柄、定时器、连接） | ✅ 释放 |
| 提供一项服务（挂 `ctx.xxx`） | ✅ 摘除 |
| 发送网络请求 | ❌ 不可逆 |
| 写文件 | ❌ 不可逆（需另设补偿逻辑） |

更精确的说法：**可逆副作用 = 可撤销的注册（revocable registration）+ 资源获取的自动释放**。

术语叫 **cleanup-able side effect** 或 **scoped effect**。

### A.4 术语谱系

这不是新发明，而是几种经典模式的合流：

| 模式 | 说明 |
|---|---|
| **RAII**（Resource Acquisition Is Initialization） | C++ 惯用法。Cordis 把「作用域」从**词法作用域**换成了**插件生命周期**（fiber），所以更准确的名字是 **lifetime-scoped resource management** |
| **`IDisposable` / Disposable Pattern** | .NET 的 `using` + `IDisposable`。Cordis 直接沿用了 `Disposable` 类型名 |
| **React `useEffect` cleanup** | **最贴近的类比** —— effect 体立即执行，返回的函数在卸载时执行。区别是 Cordis 不依赖 diff 和依赖数组，而是由**服务可用性（inject）**驱动重算 |
| **结构化并发**（structured concurrency） | Nursery / `TaskGroup` 的思想：子任务生命周期不得超过父任务 |
| **补偿事务 / Saga Pattern** | 区别是 Saga 的补偿是**业务语义**上的，Cordis 的是**运行时资源**上的 |
| **DI 容器的 Scoped Lifetime** | 最接近的工业界类比（Spring `@PreDestroy`、Angular `ngOnDestroy`）。但那些通常挂在 **Bean 级别**，Cordis 把粒度下沉到了**每一次注册** |

### A.5 具体机制

**基本 API**：

```ts
const dispose = ctx.effect(() => {
  // ① 执行副作用（立即运行）
  someRegistry.push(entry)
  // ② 返回释放器
  return () => { someRegistry.splice(index, 1) }
}, 'label-for-diagnostics')
```

语义：

> `execute` runs immediately; the disposers it produces are collected and run (**in reverse order**) either when the returned disposer is called **or when the fiber unloads, whichever comes first**. Calling the disposer twice is a **no-op**.

| 性质 | 术语 | 含义 |
|---|---|---|
| 立即执行 | eager evaluation | 不是惰性的 |
| 注册逆序释放 | **LIFO disposal order** | 后注册的先释放（同栈展开） |
| 双触发保护 | **idempotent** | 调用两次是 no-op |
| 可异步 | async-disposable | 卸载会 await 释放完成 |

**Generator effect**：effect 体返回一个**迭代器**，每 yield 一个释放器就立即登记一个。术语叫 **incremental registration** —— 适用于「申请资源的过程本身可能失败」的场景：申请到一半失败了，前面已登记的部分照样会被正确释放。

**所有注册 API 都是 effect 的语法糖** —— 这是最关键的实现细节。看 `ctx.on()`：

```ts
// vendor/cordis/src/events.ts
register(label: string, hooks: Hook[], callback: any, options: EventOptions): () => void {
  const method = options.prepend ? 'unshift' : 'push'
  return this.ctx.fiber.effect(() => {
    hooks[method]({ ctx: this.ctx, callback, ...options })   // 副作用：加监听器
    return () => this.unregister(hooks, callback)            // 释放器：摘监听器
  }, label)
}
```

**`ctx.on()` 内部就是 `fiber.effect()`**。

> 含义：**有 `ctx.on()` 可用时，永远不会出现「忘了写 disposer」的问题** —— 框架替你写了。同理还有 `ctx.provide()`、`ctx.set()`、工具注册等。

**Effect 树（所有权层级）**：effect 执行期间注册的 effect 会成为它的 **children**：

```ts
export interface EffectMeta {
  label: string          // 如 `ctx.on("event")`、`ctx.provide("name")`
  children: EffectMeta[] // 本 effect 运行期间注册的嵌套 effect
}
```

所以运行时有一棵**effect 所有权树**。卸载一个节点 = 递归撤销整棵子树。这是 **ownership tree** / **disposal tree** 模式。

**Fiber 状态机**：

```
PENDING    等待所需服务就绪（inject 未满足）
   ↓
LOADING    插件回调正在执行
   ↓
ACTIVE     已加载并提供服务
   ↓
UNLOADING  释放器正在运行（此时禁止新建 effect）
   ↓
DISPOSED   已移除，不可重启
（FAILED    回调或 config 抛错）
```

> ⚠️ `UNLOADING` 状态下 `effect()` 会抛错，错误码 `INACTIVE_EFFECT`。这是**关闭期的写屏障** —— 防止卸载过程中又产生新的、可能泄漏的注册。

### A.6 为什么这是架构的基石

| 能力 | 依赖的可逆性 |
|---|---|
| **热重载（HMR）** | 卸载 fiber → 撤销全部 effect → 重新执行 → 得到干净状态。**不需要手写 reload 逻辑** |
| **配置实时 patch（`patchReload: live`）** | 换掉一行插件配置 = 卸载旧 fiber + 挂载新 fiber |
| **一份代码多个 Profile（web/headless/sdk）** | 插件之间无隐式耦合，全靠 ctx 服务查找；换个组合就是换个产品 |

反过来说，如果没有可逆性，要实现热重载就得**为每个插件手写 reset 逻辑** —— 那就是经典的「全局状态污染导致 reload 后行为诡异」问题。

### A.7 与上层概念的连接

```
Cordis 三大贡献物
├── services      → 也是 effect（提供即注册）
├── typed events  → ctx.on() 内部就是 effect
└── reversible effects → 底层原语本身
```

而 `declare module '@deepseek-ai/cordis'` 那段类型声明，加的是**编译期的类型**；`ctx.effect()` 管的是**运行期的生命周期**。两者配合，就是「挂载时类型正确、卸载时资源干净」。

---

## 附录 B：自测题

### 第一组：静态结构

**Q**：为什么说「连 agent loop 本身都是插件」？这带来什么能力？

<details>
<summary>参考答案</summary>

因为 `core/agent`（接口 + 注册表，`ctx.agents`）和 `core/agent-loop`（默认实现，`ctx.agentLoop`）是分开的。换成自己的实现，只需在 profile 里替换 `agent-loop` 那一行 —— 这就是「可替换性」。

</details>

**Q**：patch 一个插件的配置时，只写想改的字段行不行？

<details>
<summary>参考答案</summary>

不行。**patch 是整体替换 config，不是深度合并**。必须把其余字段全部重写一遍，否则会丢。

</details>

### 第二组：运行时

**Q**：在 `agent/pre-step` 上注册监听器却忘记调 `next()`，会发生什么？

<details>
<summary>参考答案</summary>

**整个 agent 卡死**。因为 `agent/pre-step` 是 waterfall（中间件链），不调 `next()` 就是短路，下游包括内置行为永远不会执行。

</details>

**Q**：`turn` 和 `step` 的区别是什么？一个 turn 可以有几个 step？

<details>
<summary>参考答案</summary>

- **step** = 一次模型请求 + 它调用的工具
- **turn** = 0 到 N 个 step

turn 可以是 **0 步**（输入被拒或为空）。

</details>

### 第三组：会话日志（重点）

**Q1**：模型在对话中看到的第 3 条消息，对应日志里第几条事件？为什么不一定相等？

<details>
<summary>参考答案</summary>

不一定相等，两个原因：

1. **存在非可见面事件**：`turn/start`、`step/start`、`tool/call` 等不产生消息，所以第 3 条消息的 seq 通常 > 2
2. **`replace` 会造成跳号**：压缩后可见面上的 seq 不连续（如 `[0, 1, 2, 41, 42]`）

所以「第 N 条消息」和「第 N 个事件」之间**没有任何固定关系** —— 这就是 `deriveMessages()` 必须真的遍历 `surface.nodes`，而不能用 `log[i]` 猜的原因。

</details>

**Q2**：压缩（compaction）之后，日志里被压缩掉的原始事件还在吗？为什么？

<details>
<summary>参考答案</summary>

**还在**。日志是 **append-only**，只追加不删除。压缩的做法是**追加一条带 `{ op: 'replace', startSeq, endSeq }` 的新事件**，让被替换的事件从**可见面**上消失 —— 但它们仍然留在日志里。

保留的原因：审计、回放/调试、重新压缩、模型升级后重跑。

</details>

**Q3**：为什么「读打开」一个旧版本会话，不会在磁盘上产生新文件？

<details>
<summary>参考答案</summary>

**注意：读打开照样做完整的格式迁移**（解码 + 相邻迁移链 + 校验），只是结果**只留在内存**、不发布 successor。

不写盘的原因是**读操作不应该有副作用**，具体后果：

| 理由 | 如果读也写盘的后果 |
|---|---|
| 读不应有副作用 | 「打开看看」会改用户磁盘 |
| 权限 | 只读文件系统下根本读不了 |
| 并发 | 多窗口同时打开会抢着发布 successor |
| 空间 | 扫一眼列表就为每个老会话产生新文件 |

</details>

**Q4**：为什么版本迁移要用「相邻链」（v1→v2→v3）而不是直接写「v1→v3」？

<details>
<summary>参考答案</summary>

**组合性**。假设要支持 v1–v5：

- 大转换：v1→v5、v2→v5、v3→v5、v4→v5 —— **4 套逻辑**
- 相邻链：v1→v2、v2→v3、v3→v4、v4→v5 —— **4 个小步骤，可任意组合**

加 v6 时，相邻链只需写**一个** v5→v6，其余组合自动可用。

</details>

**Q5**：如果想让模型「知道用户切换了工作目录」，正确的做法是什么？错误做法的后果？

<details>
<summary>参考答案</summary>

**错误做法**：直接在发给模型的请求里 push 一条 system message。

后果：本次模型确实看到了，但**日志里没有** → 用户重开会话时 `deriveMessages()` 从日志算 → 这条不见了 → 模型基于旧目录继续工作 → **静默出错**。

**正确做法**（「模型可见即已记录」）：

1. 在 `SessionEventMap` 里加新事件类型（如 `session/cwd-changed`）
2. 追加到日志
3. 在 `deriveEventMessage` 里写投影规则

</details>
