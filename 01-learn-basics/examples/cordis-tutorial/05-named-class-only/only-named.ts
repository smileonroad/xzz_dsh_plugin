import { Service, type Context } from '@deepseek-ai/cordis'

// 只有【具名导出】，没有 export default
export class OnlyNamed extends Service {
  constructor(ctx: Context) {
    super(ctx, 'onlyNamed')
    console.log('   具名导出的类跑起来了')
  }
}
