// 补全件：按正文描述 + 同模块/相邻实验源码推得，非文档原文。
import type { Context } from '@deepseek-ai/cordis'
import * as Greeter from './greeter.ts'
import * as Late from './late.ts'

export const name = 'inject-why-dynamic'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setTimeout(async () => {
      console.log('[t=0]   ── 此刻没有任何 greeter 提供方 ──')
      await wait(200)

      console.log('[t=200] ── 挂载 greeter 提供方 ──')
      let provider = ctx.plugin(Greeter)
      ctx.plugin(Late)
      await wait(200)

      console.log('[t=400] ── 卸载提供方 ──')
      await provider.dispose()
      await wait(200)

      console.log('[t=600] ── 重新挂载提供方（新 fiber）──')
      provider = ctx.plugin(Greeter)
      await wait(200)

      console.log('[t=800] ── 结束 ──')
      process.exit(0)
    }, 0)
    return () => clearTimeout(timer)
  })
}
