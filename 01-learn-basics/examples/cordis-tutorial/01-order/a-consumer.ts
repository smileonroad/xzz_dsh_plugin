import type { Context } from '@deepseek-ai/cordis'
import type {} from './b-provider.ts'

export const name = 'a-consumer'
export const inject = ['hello']

export function apply(ctx: Context) {
  console.log(`A（消费者）执行了 —— ${ctx.hello.greet()}`)
}
