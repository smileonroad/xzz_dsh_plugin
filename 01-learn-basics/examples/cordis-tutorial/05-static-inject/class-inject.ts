import { Service, type Context } from '@deepseek-ai/cordis'

export class ClassInject extends Service {
  static inject = ['greeter']      // 类上的静态 inject —— 会生效吗？

  constructor(ctx: Context) {
    super(ctx, 'classInject')
    console.log('   类插件跑起来了')
  }
}

export default ClassInject
