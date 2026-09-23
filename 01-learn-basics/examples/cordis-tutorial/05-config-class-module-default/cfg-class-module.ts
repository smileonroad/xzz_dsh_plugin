// 补全件：按正文描述 + 同模块/相邻实验源码推得，非文档原文。
import { Service, type Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export interface Config {
  greeting: string
  targets: string[]
}

export const Config: Schema<Config> = Schema.object({   // ❌ 挂在【模块】上（唯一的不同）
  greeting: Schema.string().default('Hello'),
  targets: Schema.array(String).default(['world']),
})

export class CfgClassModule extends Service {
  constructor(ctx: Context, config: Config) {
    super(ctx, 'cfgClassModule')
    console.log(`   [模块级 Config] apply 收到的 config = ${JSON.stringify(config)}`)
    console.log(`   targets 的类型 = ${typeof config.targets}`)
  }
}

export default CfgClassModule
