import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'

export const name = 'abort-demo'
export const inject = ['tools']

// 故意【不监听】signal 的 sleep —— 演示「body 无视取消」时流水线怎么办
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'slow',
    description: 'Sleep for the given milliseconds, then report.',
    parameters: {
      ms: { type: 'integer', required: true, description: 'How long to sleep' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      console.log(`   [body] 开始睡 ${args.ms}ms，此刻 exec.signal.aborted =`, exec.signal.aborted)
      await sleep(args.ms)
      console.log('   [body] 自然睡醒，此刻 exec.signal.aborted =', exec.signal.aborted, '→ 照常返回成功值')
      return `slept ${args.ms}ms`
    },
  }))

  void (async () => {
    // ① 中途取消：body 要睡 400ms，调用方 100ms 时 abort()
    const c1 = new AbortController()
    const p1 = ctx.tools.execute({
      callId: brandString<ToolCallId>('a1'),
      name: 'slow',
      arguments: { ms: 400 },
      signal: c1.signal,
    })
    setTimeout(() => {
      console.log('--- 调用方：abort()（此刻 body 还在睡）---')
      c1.abort()
    }, 100)
    const r1 = await p1
    console.log('① 中途取消 isError:', r1.isError, '| code:', r1.error?.info?.code)
    console.log('① content:', JSON.stringify(r1.content))

    // ② 出发前已取消：signal 在 execute 调用前就是 aborted
    const c2 = new AbortController()
    c2.abort()
    const r2 = await ctx.tools.execute({
      callId: brandString<ToolCallId>('a2'),
      name: 'slow',
      arguments: { ms: 400 },
      signal: c2.signal,
    })
    console.log('② 预先取消 isError:', r2.isError, '| code:', r2.error?.info?.code, '（注意上面没有 [body] 打印）')

    // ③ 对照：教程的写法 —— controller 当场丢弃，永远不会有人 abort
    const r3 = await ctx.tools.execute({
      callId: brandString<ToolCallId>('a3'),
      name: 'slow',
      arguments: { ms: 50 },
      signal: new AbortController().signal,
    })
    console.log('③ 不可取消 signal:', JSON.stringify(r3.content), '| isError:', r3.isError)
  })()
}
