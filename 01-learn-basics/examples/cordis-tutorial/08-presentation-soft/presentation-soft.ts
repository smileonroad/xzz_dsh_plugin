import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'presentation-soft'
// 没有 inject —— presentCall/presentResult 是纯函数，直接调用即可

export function apply(_ctx: Context) {
  const tool = defineTool({
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
    // UI 卡片投影：调用期（PENDING 卡片）
    presentCall: args => ({ card: 'generic', title: `Greet ${args.name}` }),
    // UI 卡片投影：完成期
    presentResult: args => ({ card: 'generic', title: `Greeted ${args.name}` }),
  })

  console.log('① 合法 args:', JSON.stringify(tool.presentCall?.({ name: 'Ada' })))
  // @ts-expect-error 故意的：模拟旧版日志里的非法参数
  console.log('② 类型非法(42):', tool.presentCall?.({ name: 42 }))
  // @ts-expect-error 故意的：模拟缺必填字段的旧日志
  console.log('③ 缺必填({}):', tool.presentCall?.({}))
  // @ts-expect-error 故意的：非法 args 走完成期投影
  console.log('④ presentResult 非法 args:', tool.presentResult?.({ name: 42 }, { content: [], isError: false }))
  console.log('   —— 全部【没有抛异常】，非法 args 一律返回 undefined（通用回退）')
}
