import type { Context } from '@deepseek-ai/cordis'

export const name = 'lifecycle-demo'

function heartbeat(ctx: Context) {
  console.log('heartbeat plugin loading')
  ctx.effect(() => {
    const timer = setInterval(() => console.log('tick'), 200)
    return () => {
      clearInterval(timer)
      console.log('heartbeat cleaned up')
    }
  })
}

export function apply(ctx: Context) {
  // 挂载一个子插件，并保留它的 fiber 以便稍后销毁
  const fiber = ctx.plugin(heartbeat)
  // 这个演示用的定时器本身也是一个 effect：如果本插件先被卸载，
  // 待触发的回调会被取消，而不是在一个已死的应用上触发。
  ctx.effect(() => {
    const timer = setTimeout(async () => {
      await fiber.dispose()
      console.log('disposed')
      process.exit(0)
    }, 700)
    return () => clearTimeout(timer)
  })
}
