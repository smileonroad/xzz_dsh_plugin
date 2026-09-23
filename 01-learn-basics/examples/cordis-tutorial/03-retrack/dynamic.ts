import type { Context } from '@deepseek-ai/cordis'
import * as Greeter from './greeter.ts'
import * as Consumer from './consumer.ts'

export const name = 'dynamic-demo'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setTimeout(async () => {
      console.log('[t=0]    挂载 provider + consumer')
      let provider = ctx.plugin(Greeter)
      ctx.plugin(Consumer)
      await wait(300)

      console.log('[t=300]  卸载 provider（consumer 应随之卸载）')
      await provider.dispose()
      await wait(300)

      console.log('[t=600]  重新挂载 provider（consumer 应重新加载）')
      provider = ctx.plugin(Greeter)
      await wait(300)

      console.log('[t=900]  结束')
      process.exit(0)
    }, 0)
    return () => clearTimeout(timer)
  })
}
