import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'

export const name = 'policy-chain'
export const inject = ['tools']

export function apply(ctx: Context) {
  // ① pre-execute：可扩展的 允许/拒绝/询问 策略门
  ctx.on('tools/pre-execute', async (exec, next) => {
    console.log('1. [pre-execute] 看到调用:', exec.name)
    const decision = await next()   // 委托内层；最内层默认 { kind: 'allow' }
    console.log('2. [pre-execute] 决策:', decision.kind)
    return decision
  })

  // ② guard：单调的最终拒绝（在 pre-execute 之后检查）
  ctx.tools.guard(exec => {
    console.log('3. [guard] 检查:', exec.name)
    return undefined                 // undefined = 放行；返回字符串 = 拒绝理由
  })

  // ③ tools/execute：环绕分发的包装器（截止时间/重试/指标的位置）
  ctx.on('tools/execute', async (exec, next) => {
    console.log('4. [execute 包装] 分发前')
    const result = await next()
    console.log('6. [execute 包装] 分发后, isError =', result.isError)
    return result
  })

  // ④ post-execute：规范化结果的接受/替换/阻止
  ctx.on('tools/post-execute', async (exec, result, next) => {
    console.log('7. [post-execute] 看到结果, isError =', result.isError)
    return next()                    // accept
  })

  // ⑤ tools/result：纯观察，改不了任何东西
  ctx.on('tools/result', (exec, result) => {
    console.log('8. [tools/result] 最终结果:', JSON.stringify(result.content))
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
      console.log('5. [body] execute 运行')
      return `Hello, ${args.name}!`
    },
  }))

  void (async () => {
    const r = await ctx.tools.execute({
      callId: brandString<ToolCallId>('chain-1'),
      name: 'greet',
      arguments: { name: 'Cordis' },
      signal: new AbortController().signal,
    })
    console.log('9. [调用方] 收到:', JSON.stringify(r.content))
  })()
}
