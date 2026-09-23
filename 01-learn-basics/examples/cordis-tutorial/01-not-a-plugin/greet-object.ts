import type { Context } from '@deepseek-ai/cordis'

// 一个【没有 apply 方法】的普通对象 —— 不是插件
export default {
  greet(ctx: Context) {
    console.log('这行永远不会执行')
  },
}
