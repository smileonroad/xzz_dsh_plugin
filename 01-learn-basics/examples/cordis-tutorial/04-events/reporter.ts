import type { Context } from '@deepseek-ai/cordis'
import type {} from './stats.ts'          // ← 只为声明合并，运行时无副作用

export const name = 'reporter'
export const inject = ['stats']

export function apply(ctx: Context) {
  ctx.on('stats/report', (name, count) => {               // ← 监听
    console.log(`[stats] ${name} -> ${count}`)
  })
  ctx.stats.bump('tool_call')
  ctx.stats.bump('tool_call')
  ctx.stats.bump('prompt')
}
