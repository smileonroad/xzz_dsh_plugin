import { Service, type Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

declare module '@deepseek-ai/cordis' {
  interface Context {
    greeter: GreeterService
  }
}

export interface Config {
  label: string
}

export const Config: Schema<Config> = Schema.object({
  label: Schema.string().default('?'),
})

export class GreeterService extends Service {
  label: string

  constructor(ctx: Context, config: Config) {
    super(ctx, 'greeter')
    this.label = config.label
  }

  greet(who: string) {
    return `[实例 ${this.label}] Hello, ${who}!`
  }
}

export const name = 'greeter'

export function apply(ctx: Context, config: Config) {
  console.log(`   greeter 提供方启动，label=${config.label}`)
  ctx.plugin(GreeterService, config)
}
