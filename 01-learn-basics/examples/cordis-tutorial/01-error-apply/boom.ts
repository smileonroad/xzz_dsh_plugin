import type { Context } from '@deepseek-ai/cordis'

export const name = 'boom'

export function apply(ctx: Context) {
  throw new Error('apply exploded')
}
