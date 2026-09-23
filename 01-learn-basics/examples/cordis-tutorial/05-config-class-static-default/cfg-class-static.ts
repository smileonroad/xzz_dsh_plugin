import { Service, type Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export interface Config {
  greeting: string
  targets: string[]
}

export class CfgClassStatic extends Service {
  static Config: Schema<Config> = Schema.object({        // ✅ 挂在【类】上
    greeting: Schema.string().default('Hello'),
    targets: Schema.array(String).default(['world']),
  })

  constructor(ctx: Context, config: Config) {
    super(ctx, 'cfgClassStatic')
    console.log(`   [static Config] config = ${JSON.stringify(config)}`)
    console.log(`   targets 的类型 = ${typeof config.targets}`)
  }
}

export default CfgClassStatic      // ← 指针拐到这里，所以 Config 必须挂在类上
