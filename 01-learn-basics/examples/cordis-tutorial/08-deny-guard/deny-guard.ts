import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'

export const name = 'deny-guard'
export const inject = ['tools']

const tool = (name: string) => defineTool({
  name,
  description: `The ${name} tool.`,
  parameters: {},
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  async execute() {
    console.log(`   [${name} body] 如果打印了说明没被拒`)
    return `${name} ok`
  },
})

export function apply(ctx: Context) {
  // 第一层：pre-execute 拒绝 greet，放行 secret（委托给内层默认 allow）
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.name === 'greet') {
      return { kind: 'deny', reason: 'greet 不在允许清单里' }
    }
    return next()
  })

  // 第二层：guard —— 即使 pre-execute 放行，guard 仍能单调拒绝
  ctx.tools.guard(exec =>
    exec.name === 'secret' ? 'guard: secret 被永久禁止' : undefined,
  )

  ctx.tools.register(tool('greet'))
  ctx.tools.register(tool('secret'))

  void (async () => {
    const signal = new AbortController().signal

    const r1 = await ctx.tools.execute({
      callId: brandString<ToolCallId>('d1'),
      name: 'greet',
      arguments: {},
      signal,
    })
    console.log('① pre-execute 拒绝 → isError:', r1.isError)
    console.log('① content:', JSON.stringify(r1.content))

    const r2 = await ctx.tools.execute({
      callId: brandString<ToolCallId>('d2'),
      name: 'secret',
      arguments: {},
      signal,
    })
    console.log('② guard 拒绝 → isError:', r2.isError)
    console.log('② content:', JSON.stringify(r2.content))
  })()
}
