import type { Context } from '@deepseek-ai/cordis'
import * as Child from './child.ts'

export const name = 'parent'
export const inject = ['greeter']

export function apply(ctx: Context) {
  console.log(`   [parent 有 inject]  apply 跑了 → ${ctx.greeter.greet('parent')}`)
  ctx.plugin(Child)                    // ← child 由 parent 挂载
}
