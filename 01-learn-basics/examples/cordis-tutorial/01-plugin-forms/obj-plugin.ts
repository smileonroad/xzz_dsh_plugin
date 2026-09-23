import type { Context } from '@deepseek-ai/cordis'

// 对象形态：default 导出一个【带 apply 方法的普通对象】
export default {
  name: 'obj-plugin',
  apply(ctx: Context) {
    console.log('② 对象形态跑起来了')
  },
}
