import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'

export const name = 'unregister-demo'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.on('tools/change', () => {
    console.log('[tools/change] 可用工具集变了')
  })

  // register 返回 disposer —— 第 2 章的 ctx.effect 契约
  const dispose = ctx.tools.register(defineTool({
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
      return `Hello, ${args.name}!`
    },
  }))

  void (async () => {
    const signal = new AbortController().signal

    const before = await ctx.tools.execute({
      callId: brandString<ToolCallId>('c1'),
      name: 'greet',
      arguments: { name: 'Before' },
      signal,
    })
    console.log('注销前:', JSON.stringify(before.content))

    console.log('--- 调用 disposer ---')
    dispose()

    const after = await ctx.tools.execute({
      callId: brandString<ToolCallId>('c2'),
      name: 'greet',
      arguments: { name: 'After' },
      signal,
    })
    console.log('注销后 isError:', after.isError)
    console.log('注销后:', JSON.stringify(after.content))
  })()
}
