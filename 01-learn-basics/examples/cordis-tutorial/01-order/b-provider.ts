import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    hello: HelloService
  }
}

export class HelloService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'hello')
  }

  greet() {
    return '你好'
  }
}

export default HelloService
