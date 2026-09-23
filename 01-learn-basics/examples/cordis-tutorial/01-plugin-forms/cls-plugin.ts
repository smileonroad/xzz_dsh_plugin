import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    formsDemo: ClsPlugin
  }
}

// 类形态：Service 子类
export class ClsPlugin extends Service {
  constructor(ctx: Context) {
    super(ctx, 'formsDemo')
    console.log('③ 类形态跑起来了，并注册了服务 ctx.formsDemo')
  }
}

export default ClsPlugin
