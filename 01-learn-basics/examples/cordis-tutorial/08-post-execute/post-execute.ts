import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'

export const name = 'post-execute-demo'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.on('tools/post-execute', async (exec, result, next) => {
    // r1：接受，但替换模型可见的 content
    if (exec.callId === 'r1') {
      return { kind: 'accept', content: [{ type: 'text', text: '[内容已被 post-execute 替换]' }] }
    }
    // b1：阻止 —— 把纠正性反馈变成错误结果
    if (exec.callId === 'b1') {
      return { kind: 'block', feedback: [{ type: 'text', text: '[结果被阻止：请先确认目标]' }] }
    }
    // 其余：放行
    return next()
  })

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
      return `Hello, ${args.name}!`
    },
  }))

  void (async () => {
    const signal = new AbortController().signal
    const call = (id: string, who: string) => ctx.tools.execute({
      callId: brandString<ToolCallId>(id),
      name: 'greet',
      arguments: { name: who },
      signal,
    })

    const r1 = await call('r1', 'Replace')
    console.log('① 替换 content → isError:', r1.isError)
    console.log('① content:', JSON.stringify(r1.content))
    console.log('① value（程序化访问不受影响）:', JSON.stringify('value' in r1 ? r1.value : undefined))

    const r2 = await call('b1', 'Block')
    console.log('② block → isError:', r2.isError)
    console.log('② content:', JSON.stringify(r2.content))

    const r3 = await call('n1', 'Normal')
    console.log('③ 放行 → content:', JSON.stringify(r3.content))
  })()
}
