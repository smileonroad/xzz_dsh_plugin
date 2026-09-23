// 补全件：按正文描述 + 同模块/相邻实验源码推得，非文档原文。
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export interface Config {
  greeting: string
  target: string
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  target: Schema.string().default('world'),
})

export function apply(ctx: Context, config: Config) {
  console.log(`${config.greeting}, ${config.target}!`)
}
