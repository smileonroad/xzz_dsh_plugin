import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'

export const name = 'output-invalid'
export const inject = ['tools']

export function apply(ctx: Context) {
  // ① execute 返回违反 output.schema 的值：声明 string，返回数字
  ctx.tools.register(defineTool({
    name: 'bad-output',
    description: 'Returns a number despite declaring a string output.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() {
      // @ts-expect-error 故意的：演示注册表对返回值的校验
      return 42
    },
  }))

  // ② execute 直接抛异常（基础设施故障的正确表达方式）
  ctx.tools.register(defineTool({
    name: 'throws',
    description: 'Always throws.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() {
      throw new Error('disk on fire')
    },
  }))

  void (async () => {
    const signal = new AbortController().signal

    const r1 = await ctx.tools.execute({
      callId: brandString<ToolCallId>('o1'),
      name: 'bad-output',
      arguments: {},
      signal,
    })
    console.log('① 违反 output.schema → isError:', r1.isError, '| code:', r1.error?.info?.code)
    console.log('① content:', JSON.stringify(r1.content))

    const r2 = await ctx.tools.execute({
      callId: brandString<ToolCallId>('o2'),
      name: 'throws',
      arguments: {},
      signal,
    })
    console.log('② body 抛异常 → isError:', r2.isError)
    console.log('② content:', JSON.stringify(r2.content))
  })()
}
