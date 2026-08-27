# 2026-08-23 — events-demo，插件之间靠事件说话

## 事情是这样的

前几篇把插件能挂的东西基本摸了一遍。命令，给用户敲斜杠用的，工具，给模型长手的，配置和打包，让插件能装进别人的机器，seam，让插件之间靠键协作。

但插件之间的耦合还有另一半一直没练，事件。

## 服务是「要能力」，事件是「喊一嗓子」

服务那套（units-capability 那篇）解决的是，A 要用 B 的能力，B 把服务注册成 ctx 上的键，A inject 一下就能调，是「你要什么，我给你」的关系。

但有些时候 A 根本不知道谁会关心它做的事。命令注册了，谁在乎？工具要跑了，谁想拦一下？这种时候不可能让 A 去 import 所有感兴趣的人，那又回到互相 import 的老路。

所以 Cordis 给了第二套机制，事件。A 只需要调用 ctx.emit('something/happened', 参数) 喊一声，至于谁在听，A 不知道也不关心。这就像烽火台，点着了谁看见谁行动，点烽火的人不关心到底是谁来救。

harness 自己就是靠这个转起来的。翻源码可以看到，tools 包在 packages/core/tools/src/index.ts 里声明了三个瀑布事件，tools/pre-execute、tools/execute、tools/post-execute，分别插在工具执行前、执行中、执行后。命令包在 packages/interaction/commands/src/types.ts 里声明了 commands/change，命令注册表一变就触发。这些事件都是插件可以监听的。

## 两个插件，两种角色

这篇写了两个插件，各自扮演 waterfall 链条里的一种角色。

第一个，tool-observer，观察者。它监听 pre-execute 和 post-execute，不干预执行，只是路过看一眼，然后必须调 next() 放行。

```ts
// examples/events-demo/src/tool-observer.ts（节选）
ctx.on('tools/pre-execute', async (_exec, next) => {
  return next()   // 观察者必须委托
})
```

第二个，tool-policy，决策者。它也监听 pre-execute，但遇到封锁名单上的工具，直接返回拒绝，不调 next()。

```ts
// examples/events-demo/src/tool-policy.ts（节选）
ctx.on('tools/pre-execute', async (exec, next) => {
  if (DENIED_TOOLS.has(exec.name)) {
    return { kind: 'deny', reason: `tool "${exec.name}" is denied by the demo policy` }
  }
  return next()
})
```

被拒绝的工具会结算成一个错误结果，模型看到的文本是 `Error: denied by policy`。

完整链路是这样的。模型调工具，先过 pre-execute 瀑布，tool-observer 在最外层放行，tool-policy 检查封锁名单，放行后工具本体执行，执行完再过 post-execute 瀑布，最后结果回到模型。每一层都有机会插手，也每一层都可能短路。

waterfall 的精髓就在这里，监听器像洋葱一样一层套一层，最外层先跑，谁调 next() 谁就把接力棒往下传，谁不调，谁就是终点。

## emit，喊完就不管

瀑布是洋葱，emit 则简单得多，喊完就不管。

commands/change 是纯 emit 事件，命令注册或者注销的时候 dsh 自己触发。测试里直接 ctx.on 监听它，register 一个命令计数器加一，dispose 掉再加一，很直白。

```ts
ctx.on('commands/change', () => { changed += 1 })
ctx.commands.register({ name: 'greet', description: 'demo', handler })
```

emit 有个值得记住的特性，它是同步广播，不等人。监听器里写 async 函数，emit 触发完就返回，不 await 你的 Promise。这跟 waterfall 完全不同，瀑布要一层层等，emit 是撒手不管。用错场合会很隐蔽，比如写了个异步审计监听器以为它会跑完，其实 emit 根本不等它。

顺带一提，ctx.on 返回一个 disposer，想摘掉监听随时摘，插件卸载时监听器自动消失。这就是「注册即副作用」那套，命令和工具那两篇讲过，事件也一样。

## 最深的坑，忘调 next() 的观察者

这篇最大的教训不是代码，是纪律。

教程里有一句警告，观察者必须调用 next()，不调直接返回代表你有意短路。一开始我不以为然，觉得忘了就忘了，反正观察者什么都不干。

测试把这个想法纠正了。测试里注册了一个坏观察者，忘了调 next()，直接返回 `{ kind: 'allow' }`。因为 waterfall 最外层先跑，这个坏观察者挂在最前面，它一短路，后面的 tool-policy 根本轮不到，被封锁的 dangerous_tool 就这么执行了。

```ts
// 坏观察者：忘了 next()，静默绕过决策者
ctx.on('tools/pre-execute', async () => ({ kind: 'allow' } as const))
await ctx.plugin(toolPolicy)
// 被封锁的工具照样跑了
const result = await execute(ctx, 'dangerous_tool')
expect(result.isError).toBe(false)
```

这跟 seam 那篇的教训是一类，错误被吞掉比报错更难排查。忘了 next() 不是报错，是让下游所有决策全部失效，连报错的机会都没有。真实世界里的审计日志插件要是忘了 next()，所有工具策略会一夜之间全部失灵，而且没人知道为什么。

## 测试，真实事件走真实边界

测试装配延续系列，挂真实服务走真实边界。这次挂 SystemPrompt + ToolRuntime（跟 sql-check-tool 同一套装配），外加 CommandRuntime 测真实的 commands/change。

```ts
// examples/events-demo/tests/events-demo.spec.ts（节选）
async function toolHarness(plugins: unknown[]): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  for (const plugin of plugins) await ctx.plugin(plugin as never)
  return ctx
}
```

装配里有个值得记的细节，插件是**按顺序**传进 harness 的。因为 waterfall 最外层先跑，先挂的插件就是外层，这决定了观察者和决策者谁先看到事件。测试里把 tool-observer 挂前面、tool-policy 挂后面，语义就是观察者先路过、决策者再拍板。

10 个用例。真实的 commands/change emit 事件、ctx.on 的 disposer 手动摘监听、policy 拒绝与放行、好观察者委托后决策者依然生效、坏观察者绕过决策者，然后是三种分发模式的四个用例（serial 短路、serial 全跑、bail 同步短路、parallel 并发等待），用的是测试夹具事件。

这里需要如实说明，serial、bail、parallel 在真实 harness 里极少见，基本活在 Cordis 内部事件里。真实世界的事件要么是 emit，要么是 waterfall。所以这三种模式用夹具事件练，不假装它们是日常产品事件。这个判断是探索阶段定下来的，提案里写了。

## 接下来该干嘛

想接着练的话，两个方向。

第一个是明确排进下一个实战的，自己声明事件。这篇刻意没声明任何自有事件（除了测试夹具），下一个实战练 stats 式生产方，interface Events 声明合并，服务里 ctx.emit 发出自己的领域事件，消费方监听派生。事件机制到这里监听这半练完了，声明的下半还没练。

第二个是 approval/request，harness 里另一个真实 waterfall，策略可以代替用户作答，教程点名过。但它是个大主题，要自己搭 provider 链，值得单独一个大实战。

事件和服务凑齐了，插件之间怎么协作就有了完整画面。服务是伸手要，事件是喊一声，各自有各自的场合。说到底这两种机制是一件事的两面，都是把「谁」和「怎么做」分开，插件只认识名字，不认识彼此。这种解耦从软件工程一直延伸到 agent 架构，模型、工具、策略谁也不直接认识谁，全靠名字对上。
