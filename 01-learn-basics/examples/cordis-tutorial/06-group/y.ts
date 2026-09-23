import type { Context } from '@deepseek-ai/cordis'

export const name = 'child-y'

export function apply(ctx: Context) {
  console.log('      → child-y 挂载')
  ctx.effect(() => () => console.log('      ← child-y 卸载'))
}
