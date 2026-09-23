import type { Context } from '@deepseek-ai/cordis'

export const name = 'fn-plugin'

export function apply(ctx: Context) {
  console.log('① 函数形态跑起来了')
}
