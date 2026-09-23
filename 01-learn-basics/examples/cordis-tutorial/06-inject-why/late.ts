import type { Context } from '@deepseek-ai/cordis'

export const name = 'late'
export const inject = ['greeter']

export function apply(ctx: Context) {
  console.log(`   [late 有 inject]   apply 此刻才跑 → ${ctx.greeter.greet('late')}`)
}
