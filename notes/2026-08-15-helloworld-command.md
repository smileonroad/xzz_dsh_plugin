# 2026-08-15 — helloworld-command，第一个 dsh 插件

## 事情是这样的

我最近在折腾 DeepSeek Harness，就是那个把「一切皆插件」当口号的 agent 框架，圈里人叫它 dsh。

我写的这个插件特别简单，就是个 `/helloworld` 命令，你在 web 界面里敲一行，它回你一句问候。我把全过程整理出来。

先说你得知道的一个底层逻辑，这个搞懂了，后面所有事都顺了。

## 命令和工具，是两回事

在 dsh 里，模型能调用的东西叫「工具」，比如读文件、跑 bash，那是工具，模型自己决定什么时候调。

但 `/helloworld` 这种带斜杠的，叫「命令」。命令是给人类用的。你在界面里敲 `/helloworld 小明`，它不走模型，直接触发一个函数，立刻返回结果，界面上弹出的问候就是函数返回值。这个区别特别重要。因为很多第一次写插件的人，上来就想着「我要把功能暴露给模型」，于是去写工具。但你要是想让**用户**快速做一件确定的事，命令才是对的。命令快，不烧 token，结果可控。工具慢，要等模型想明白要不要调。

dsh 里挂命令的地方叫 `ctx.commands`，一句话概括就是，你往这个注册表里塞一个定义，界面就认了。

## 最小代码，就这么多

我一开始以为写个插件得铺一堆架子，结果不是。它的最小形态就三样东西，一个名字，一个依赖声明，一个注册动作。

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'

export const name = 'helloworld-command'
export const inject = ['commands']

export function apply(ctx: Context): void {
  ctx.commands.register({
    name: 'helloworld',
    description: 'greet the user with an optional name',
    input: { hint: '[<name>]' },
    handler,
  })
}
```

`name` 是插件的名字，得跟别人不重样。`inject` 是告诉框架，我依赖 `commands` 这个服务，你得先把它给我准备好了再加载我。`apply` 就是插件真正干活的地方，框架加载我的时候会调用它，把 `ctx` 这个上下文递给我。

`ctx.commands.register` 那一坨就是注册命令本身，`name` 是命令名，`description` 是给界面展示用的说明，`input.hint` 是提示用户这命令后面能跟什么。真正干活的是 `handler`，用户一敲命令，它就被调用。

你可能发现了，这跟网上那些 AI 教程里教的「插件 = 一个神秘的黑盒子」完全不一样。它就是一段普通的 TypeScript，你把它当普通函数写就行。

`handler` 长这样。

```ts
function handler(invocation: CommandInvocation): CommandResult {
  const name = parseName(invocation.rawInput)
  if (name === undefined && invocation.rawInput.trim().length > 0) {
    return {
      kind: 'error',
      text: 'Usage: /helloworld [<name>] — a single word name, no spaces.',
    }
  }
  return renderGreeting(name)
}
```

它接收一个 `invocation`，里面有用户敲的原始文本 `rawInput`，然后返回一个结果。结果分两种，`kind: 'success'` 就是成功，带一段文字，`kind: 'error'` 就是失败，界面会拿红字显示。

这里有个细节我一开始没注意，`rawInput` 是包含那个空格在内的。你敲 `/helloworld 小明`，`rawInput` 是 `" 小明"`，前面带一个空格，因为它是命令名后面跟着的原文。所以解析的时候必须先 trim 一下，不然老觉得自己写的解析有问题。

## 三个让新手懵圈的机制

代码就这些，但背后有三个机制，不搞懂它们，你会在调试的时候怀疑人生。

第一个是「注册即副作用」。你在 `apply` 里调 `register`，框架会自动帮你记住这个注册，你的插件一旦被卸载，这个命令会自动消失，不用你手动清理。这不是小事。dsh 是热插拔的，插件可以随时卸载重载，你要是忘了清理，卸载一次就残留一个命令，页面上的命令列表会越堆越乱。所以这个「自动清理」不是便利，是保命。

第二个是依赖驱动加载。`inject` 声明了依赖之后，框架会等你依赖的服务全部就绪了，才加载你的插件。这保证了你在 `apply` 里用的 `ctx.commands` 一定是能用的，不会出现那种「偶尔报错偶尔正常」的玄学问题。

第三个，也是我踩坑最多的，就是「加载」这件事本身。

## 真正把我卡住的，是怎么把它跑起来

代码写完了，怎么让它在 web 界面里生效？

我一开始以为，把文件放对位置，重启一下就行。结果不是。

dsh 的 web 界面是一个组合出来的东西，它启动的时候会加载一堆「bundle」，每个 bundle 是一组插件的合集。你写的新插件不在任何 bundle 里，所以它默认不会出现。

把新插件塞进去的方式，是加一个 `--patch` 参数，指向一个补丁文件。补丁文件长这样。

```yaml
- insert:
    - id: helloworld
      name: 'file:///你的绝对路径/src/index.ts'
```

注意这个 `name`，我一开始写的是绝对路径 `E:/workspace/...`，结果启动直接报错，报了一个特别奇怪的错。

```
ERR_UNSUPPORTED_ESM_URL_SCHEME: Only URLs with a scheme in: file, data, and node are supported by the default ESM loader. Received protocol 'e:'
```

我当时就愣住了。我写的是个文件路径，它怎么读出一个叫 `e:` 的协议？

原因是这样的，Node 在加载模块的时候，看到一个字符串，会先判断它是不是个 URL。`E:/workspace/...` 这个写法，`E:` 被当成了协议头，就像 `https:` 那样。所以必须写成 `file:///E:/workspace/...`，明确告诉它这是个本地文件。

然后你以为改完路径就完事了？没有。

## web 界面里加新插件，必须重启

我又踩了一个更隐蔽的坑。

dsh 的 web 是有热更新能力的，叫 HMR，改配置文件能自动生效。我满心以为，我改完补丁文件，界面会自己刷新把命令加上去。

结果没有。我等了五分钟，界面一点反应都没有。

查了半天才搞明白，web 的 HMR 在发布的时候被**默认禁用了**，源码里还留着一句注释，大意是「等热更新生命周期测完再打开」。所以你现在跑起来的 web，压根没开热更新。

那结果会怎样呢？就是加一个新插件，必须重启整个 web 进程。重启之后再访问界面，命令才会出现。

这个坑特别隐蔽，因为你不会想到一个号称「一切皆插件」的框架，加插件居然要重启。但它就这么设计的，因为插件装载是启动时组合出来的，运行中的进程不会去重新扫描你新写的文件。

## 调试的时候，console.log 会消失

第三个坑，vitest 默认拦 console 输出。

我写好代码，想加几行 `console.log` 看看命令有没有执行，结果在测试里死活看不到输出。

不是没执行，是输出被吞了。

vitest 这个测试框架，默认会拦截 console 输出，你要加一个参数才让它透出来。

```
pnpm exec vitest run ... --disableConsoleIntercept --silent=false
```

`--disableConsoleIntercept` 是关键。就这一个参数，能让你的调试日志透出来。早知道能省一小时。

这里还有个很直观的调试技巧。你加一行日志打 rawInput，跑一次测试，就能亲眼看到用户敲的原始输入长什么样。

```
[helloworld] handler called
[helloworld]   rawInput: " 小明"
[helloworld]   parsed name: "小明"
```

看到没，`rawInput` 前面真带一个空格。这比任何文档都直观。所以调试的时候，别猜，打日志，让代码自己告诉你答案。

## 写完插件，还得写测试

说到这，你可能会觉得，这么小一个插件，写什么测试啊，我本地跑一下不就行了。

我一开始也是这么想的。但我翻了 dsh 的测试规范，它有一条原则叫做「测试描述行为，不是正确性」。翻译成人话就是，你改一个功能，不用证明它「对」，你要证明它「现在是这样工作的」。听起来差不多？完全不一样。

「对」是主观的，你觉得对别人不一定觉得对。「现在是这样工作的」是客观的，它把你这个版本的行为钉死在测试里。下次谁改坏了，测试立刻告诉你。

所以我也给我的 `/helloworld` 写了测试。不多，六个用例，覆盖了它能干的每一件事。

```ts
import { describe, expect, it } from 'vitest'

describe('helloworld-command example plugin', () => {
  it('registers one global command with Loader-safe exports and disposes it', async () => {
    // 命令注册成功了吗？卸载后消失了吗？
  })

  it('greets without input', async () => {
    // 敲 /helloworld，回什么？
  })

  it('greets a named target', async () => {
    // 敲 /helloworld 小明，回什么？
  })

  it('rejects multi-word input with a usage error', async () => {
    // 敲 /helloworld 小明 小红（带空格），该报错
  })

  it('logs command/run and command/done lifecycle events', async () => {
    // 命令执行会在会话日志里留下记录吗？
  })

  it('admission misses log nothing', async () => {
    // 敲一个不存在的命令 /nope，什么都不该发生
  })
})
```

你看最后一个用例，`admission misses log nothing`，这个设计特别妙。它测试的是「一个没注册的命令，连日志都不该有」。这不是在测功能，是在测框架的行为边界。我写这个测试的时候，是真真切切体会到什么叫「测试描述行为」。

而且我后来还发现一个有意思的事。dsh 的命令注册，同一个名字注册两次会直接抛错，报错信息是 `command "helloworld" is already registered`。这个行为我当时还觉得烦，心想我多注册一次怎么了。但回头一想，这其实是个好设计，两个插件要是都抢同一个命令名，那不乱套了？所以我干脆把「重复注册应该失败」也写进了测试里。你看，这就是「描述行为」的魅力，连这种反直觉的失败都给你钉死在测试里，以后谁想改这个行为，测试先不答应。

还有个更关键的点，dsh 的测试不走捷径。它不是直接调你的 handler，而是 mount 一套真实的服务，走真实边界。

```ts
async function harness() {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(CommandRuntime)
  await ctx.plugin(AgentRegistry)
  // stub 一个 idle agent（session + inbox + 状态机），注册进 ctx.agents
  await ctx.plugin(helloworldCommand)     // 被测插件
  return { ctx, agent, session }
}
```

session 是真的，命令注册表是真的，agent 注册表是真的，唯一 stub 的只有 agent 本身。然后通过 `ctx.commands.execute(agent, line, signal)` 去执行，这条路径跟 UI 适配器是同一个入口。你测的就是用户真实会走的路线，不是你自己搭的一条捷径。

## web 端到端验证，命令节点真实渲染

写完了插件，装进了 web，怎么证明它真的能用？我把验证拆成四层，每一层都留下证据。

第一层，菜单。在输入框敲一个 `/`，补全列表里出现 helloworld，说明命令注册进了当前进程。这一步能拦住一半的坑，比如没带 `--patch` 启动、改了插件没重启，菜单里都不会有它。

第二层，实时执行。在对话流里执行 `/helloworld 实时测试`，一秒之内对话流多出一个命令节点，问候语直接渲染出来。命令不走模型，所以这个过程是瞬间的，不需要等。

第三层，持久化。命令的每次执行都会在会话日志里留下成对记录，command/run 开头，command/done 收尾，像两列对齐的账本。这一层是排查问题的真相来源，界面会骗人，日志不会。

第四层，重放与轨迹。重新打开页面，点进会话，命令节点从日志里原样重放，不用重新执行。会话面板的轨迹视图则按轮次列出每一步发生了什么，命令输入、工具调用、错误结果，按顺序排得明明白白。验证命令是否真的执行了，轨迹是最直接的证据。

四层全过，才敢说命令在 web 里可用。

## 接下来该干嘛

如果你也想试试，我给你一条完整的路径。

先跑通官方的示例，理解插件的最小组装长什么样。然后照着我这个 `/helloworld` 的模板，把 `handler` 里改成你自己想干的活。接着用 `--patch` 把它挂进 web，重启，看它出现。最后再去啃官方文档里「打包成 bundle」那一节，bundle 能让你不用每次重启都带 `--patch`，一次装进去，之后启动自动生效。

说实话我到现在还在学，这个框架的生态文档很全，但门槛确实有。我不保证你一次能跑通，但我踩过的这三个坑，你基本不会再踩了。