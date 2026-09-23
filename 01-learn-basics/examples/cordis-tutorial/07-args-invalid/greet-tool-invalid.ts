import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'

export const name = 'greet-tool-invalid'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet the named person.',
    parameters: {
      name: { type: 'string', required: true, description: 'Who to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      console.log('   [execute body] 如果这行打印了，说明校验没拦住')
      return `Hello, ${args.name}!`
    },
  }))

  void (async () => {
    const signal = new AbortController().signal

    // ① 类型错误：name 声明为 string，传数字 42
    const wrongType = await ctx.tools.execute({
      callId: brandString<ToolCallId>('bad-1'),
      name: 'greet',
      arguments: { name: 42 },
      signal,
    })
    console.log('① 类型错误 isError:', wrongType.isError)
    console.log('① 类型错误 content:', JSON.stringify(wrongType.content))

    // ② 缺少必填字段：name 是 required
    const missing = await ctx.tools.execute({
      callId: brandString<ToolCallId>('bad-2'),
      name: 'greet',
      arguments: {},
      signal,
    })
    console.log('② 缺字段 content:', JSON.stringify(missing.content))
  })()
}
