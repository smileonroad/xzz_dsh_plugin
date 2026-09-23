import { Service, type Context } from '@deepseek-ai/cordis'

// 完全没有 Config —— Cordis 应当静默放行
export class NoConfig extends Service {
  constructor(ctx: Context, config: any) {
    super(ctx, 'noConfig')
    console.log(`   [没有 Config] apply 收到的 config = ${JSON.stringify(config)}`)
  }
}

export default NoConfig
