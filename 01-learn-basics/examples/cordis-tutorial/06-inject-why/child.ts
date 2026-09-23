import type { Context } from '@deepseek-ai/cordis'

export const name = 'child'

export function apply(ctx: Context) {
  console.log(`   [child ⚠️无 inject]  沿 ctx 树向上找到 → ${ctx.greeter.greet('child')}`)
}
