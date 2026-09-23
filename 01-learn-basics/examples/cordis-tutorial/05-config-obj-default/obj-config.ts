import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export interface Config {
  greeting: string
  targets: string[]
}

// default 导出的是一个【对象】—— 元数据就直接写在对象字面量里
export default {
  name: 'obj-config',
  Config: Schema.object({
    greeting: Schema.string().default('Hello'),
    targets: Schema.array(String).default(['world']),
  }),
  apply(ctx: Context, config: Config) {
    console.log(`   [对象字面量里的 Config] ${JSON.stringify(config)}`)
  },
}
