import type { Context } from '@deepseek-ai/cordis'

export const name = 'consumer'
export const inject = ['greeter']

export function apply(ctx: Context) {
  console.log(`   consumer 看到的是 → ${ctx.greeter.greet('world')}`)
}
