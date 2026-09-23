// 补全件：按正文描述 + 同模块/相邻实验源码推得，非文档原文。
import type { Context } from '@deepseek-ai/cordis'

export const name = 'consumer'
export const inject = ['greeter']

export function apply(ctx: Context) {
  console.log(`   ✅ consumer 加载了：${ctx.greeter.greet('world')}`)
}
