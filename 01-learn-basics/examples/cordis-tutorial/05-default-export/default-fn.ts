// 补全件：按正文描述 + 同模块/相邻实验源码推得，非文档原文。
import type { Context } from '@deepseek-ai/cordis'

export const name = 'default-export'
export const inject = ['greeter']

// default 导出 —— 指针拐到这个函数上，
// 所以模块级的 name / inject / Config 全部失效。
export default function myPlugin(ctx: Context) {
  console.log('插件跑起来了')
}
