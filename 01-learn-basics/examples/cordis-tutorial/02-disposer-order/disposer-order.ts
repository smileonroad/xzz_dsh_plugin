import type { Context } from '@deepseek-ai/cordis'

export const name = 'disposer-order'

const t0 = Date.now()
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const stamp = () => `+${String(Date.now() - t0).padStart(4, ' ')}ms`

/** 被观察的子插件：注册三个耗时不同的 disposer */
function worker(ctx: Context) {
  const register = (tag: string, ms: number) => {
    ctx.effect(() => {
      console.log(`  ${stamp()}  注册 ${tag}（disposer 耗时 ${ms}ms）`)
      return async () => {
        console.log(`  ${stamp()}  ${tag} 清理【开始】`)
        await wait(ms)
        console.log(`  ${stamp()}  ${tag} 清理【完成】`)
      }
    })
  }

  // 注册顺序：A → B → C，耗时 90 / 10 / 50
  register('A', 90)
  register('B', 10)
  register('C', 50)
}

export function apply(ctx: Context) {
  const fiber = ctx.plugin(worker)

  ctx.effect(() => {
    const timer = setTimeout(async () => {
      console.log(`\n  ${stamp()}  ── 开始卸载 ──`)
      await fiber.dispose()
      console.log(`  ${stamp()}  ── 卸载结束（总耗时 = 最慢的那个，说明是并发跑的）──`)
      process.exit(0)
    }, 200)
    return () => clearTimeout(timer)
  })
}
