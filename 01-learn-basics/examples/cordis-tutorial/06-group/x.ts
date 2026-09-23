import type { Context } from '@deepseek-ai/cordis'

export const name = 'child-x'

export function apply(ctx: Context) {
  console.log('      → child-x 挂载')
  ctx.effect(() => () => console.log('      ← child-x 卸载'))
}
