// 诊断启动器 —— 和 vendor/cordis/bin.js 做同样三件事，只多两步。
//
// 为什么需要它：`bin.js` 读的 cordis.yml 里，`logger-console` 本身也是一个条目，
// 而条目是【并发】加载的（group.ts 的 Promise.all）。于是启动期出错的插件，
// 它的 `logger.error(error)` 往往赶在 exporter 注册之前发出 —— 直接丢掉。
// 加上 loader 现在把条目失败 catch 成日志、不再抛给顶层的 bin.js，
// 结果就是「插件挂了，你什么都看不到，退出码还是 0」。
//
// 这个启动器把顺序倒过来：先把日志出口装上，再读 cordis.yml。
//
// 用法（在某个实验目录里）：
//     node --import tsx ../_diag.ts
import { Context, FiberState } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import ConsoleLogger from '@deepseek-ai/cordis-plugin-logger-console'
import { pathToFileURL } from 'node:url'

const ctx = new Context()
ctx.baseUrl = pathToFileURL(process.cwd()).href + '/'
await ctx.plugin(Loader)

// ① 日志出口先就位 —— 这一句是全部意义所在
await ctx.plugin(ConsoleLogger, { levels: { default: 3 } } as any)

// ② 再按 bin.js 的方式读实验自己的 cordis.yml
await ctx.loader.create({
  name: '@deepseek-ai/cordis-plugin-include',
  config: { path: './cordis.yml' },
})

// ③ 收尾把没跑起来 / 跑挂了的 fiber 汇总一行，免得漏看
setTimeout(() => {
  const bad: string[] = []
  for (const runtime of ctx.registry.values()) {
    for (const fiber of runtime.fibers) {
      const state = FiberState[fiber.state]
      if (state === 'FAILED' || state === 'PENDING') bad.push(`${fiber.name} = ${state}`)
    }
  }
  if (bad.length) console.log(`\n── 异常 fiber ──\n  ${bad.join('\n  ')}`)
}, 800)
