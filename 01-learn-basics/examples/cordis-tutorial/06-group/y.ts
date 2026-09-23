// 补全件：按正文描述 + 同模块/相邻实验源码推得，非文档原文。
import type { Context } from '@deepseek-ai/cordis'

export const name = 'child-y'

export function apply(ctx: Context) {
  console.log('      → child-y 挂载')
  ctx.effect(() => () => console.log('      ← child-y 卸载'))
}
