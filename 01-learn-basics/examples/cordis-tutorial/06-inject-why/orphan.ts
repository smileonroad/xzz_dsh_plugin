import type { Context } from '@deepseek-ai/cordis'

export const name = 'orphan'

export function apply(ctx: Context) {
  console.log('   orphan 的 apply 跑了')
  console.log(ctx.greeter.greet('orphan'))
}
