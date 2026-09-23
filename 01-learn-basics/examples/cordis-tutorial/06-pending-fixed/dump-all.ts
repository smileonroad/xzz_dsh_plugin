import { FiberState, type Context } from '@deepseek-ai/cordis'

export const name = 'dump-all'

// 把所有 fiber 的名字和状态都打出来（不过滤 PENDING）。
export function apply(ctx: Context) {
  setTimeout(() => {
    console.log('  名字                                  状态')
    for (const runtime of ctx.registry.values()) {
      for (const fiber of runtime.fibers) {
        console.log(`  ${fiber.name.padEnd(36)} ${FiberState[fiber.state]}`)
      }
    }
  }, 500)
}
