import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'show-schema'
// 注意：没有 inject —— defineTool 是纯函数，不需要 tools 服务在场

export function apply(_ctx: Context) {
  const tool = defineTool({
    name: 'greet',
    description: 'Greet the named person.',
    parameters: {
      name: { type: 'string', required: true, description: 'Who to greet' },
      age: { type: 'integer', description: 'Optional age' },
      lang: { type: 'string', enum: ['zh', 'en'], description: 'Language' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  })

  console.log('parameters —— 交给模型的 JSON Schema:')
  console.log(JSON.stringify(tool.parameters, null, 2))
  console.log('output.schema:')
  console.log(JSON.stringify(tool.output.schema))
}
