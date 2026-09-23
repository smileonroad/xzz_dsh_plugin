import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'

export const name = 'nested-schema'
export const inject = ['tools']

export function apply(ctx: Context) {
  const tool = defineTool({
    name: 'query',
    description: 'Query with a nested filter.',
    parameters: {
      name: { type: 'string', required: true, description: 'Who' },
      filter: {
        type: 'object',
        additionalProperties: false,          // 显式对象节点【必须】声明开放性
        description: 'Nested filter',
        properties: {
          tags: { type: 'array', items: { type: 'string' }, description: 'Tag list' },
          mode: {
            // 恰好一个分支：两个 const 互斥
            oneOf: [{ type: 'string', const: 'fast' }, { type: 'string', const: 'slow' }],
            description: 'Exactly one',
          },
          style: {
            // 故意重叠：'a' 会同时命中两个分支 → 违反「恰好一个」
            oneOf: [{ type: 'string' }, { type: 'string', enum: ['a', 'b'] }],
          },
        },
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      console.log('   [body] 收到 args:', JSON.stringify(args))
      return 'ok'
    },
  })

  ctx.tools.register(tool)

  console.log('生成的 JSON Schema（紧凑）:')
  console.log(JSON.stringify(tool.parameters))
  console.log('')

  void (async () => {
    const signal = new AbortController().signal
    const call = (id: string, args: unknown) => ctx.tools.execute({
      callId: brandString<ToolCallId>(id),
      name: 'query',
      arguments: args,
      signal,
    })

    const a = await call('n-a', { name: 'ada', filter: { tags: ['x'], mode: 'fast' } })
    console.log('A 合法嵌套 →', JSON.stringify(a.content), '\n')

    const b = await call('n-b', { name: '', filter: { mode: 'slow' } })
    console.log('B 空字符串 → isError:', b.isError, '（schema 放行了！）\n')

    const c = await call('n-c', { name: 'x', filter: { mode: 'other' } })
    console.log('C oneOf 零命中 →', JSON.stringify(c.content), '\n')

    const d = await call('n-d', { name: 'x', filter: { style: 'a' } })
    console.log('D oneOf 双命中 →', JSON.stringify(d.content), '\n')

    const e = await call('n-e', { name: 'x', filter: { nope: 1 } })
    console.log('E 多余属性 →', JSON.stringify(e.content))
  })()
}
