// 补全件：按正文描述 + 同模块/相邻实验源码推得，非文档原文。
import type { Context } from '@deepseek-ai/cordis'

export const name = 'child-x'

export function apply(ctx: Context) {
  console.log('      → child-x 挂载')
  ctx.effect(() => () => console.log('      ← child-x 卸载'))
}
