import type { Context } from '@deepseek-ai/cordis'

export const name = 'default-export'
export const inject = ['greeter']

// default 导出 —— 指针拐到这个函数上，
// 所以模块级的 name / inject / Config 全部失效。
export default function myPlugin(ctx: Context) {
  console.log('插件跑起来了')
}
