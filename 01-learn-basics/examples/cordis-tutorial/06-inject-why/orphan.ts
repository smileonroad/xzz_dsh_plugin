// 补全件：按正文描述 + 同模块/相邻实验源码推得，非文档原文。
import type { Context } from '@deepseek-ai/cordis'

export const name = 'orphan'

export function apply(ctx: Context) {
  console.log('   orphan 的 apply 跑了')
  console.log(ctx.greeter.greet('orphan'))
}
