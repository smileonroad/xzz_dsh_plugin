/**
 * 离线模型适配器的行为测试。
 *
 * 分两层：端到端那几条挂真实服务 + 生产 AgentLoop（装配来自
 * `@deepseek-ai/dsh-agent-loop-testkit`），协议与注册那几条只挂
 * `LlmRuntime`，直接在 `ctx.llm.stream()` 这个真实边界上观察。
 *
 * 测试描述的是「现在是这样工作的」，包括那些反直觉的地方：
 * 适配器抛异常后消费方看到的是 finish、显式指定不支持的 reasoning
 * 会在 stream 之前被拒、`finish` 之后多发一个分片会被 invariant 拦下。
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import LlmRuntime, { ReasoningEffortId, ToolCallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import * as LlmInvariant from '@deepseek-ai/dsh-llm/invariant'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { SessionId } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { buildModelCatalog } from '@deepseek-ai/dsh-api-session-controller'
import * as guard from '../src/guard.ts'
import * as scripted from '../src/index.ts'
import { ScriptedAdapter } from '../src/index.ts'
import type { ScriptedModelConfig } from '../src/index.ts'

const DEMO: ScriptedModelConfig = {
  id: 'demo',
  name: 'Scripted demo',
  contextWindow: 32000,
  reasoningEfforts: ['off', 'low', 'high'],
  defaultReasoningEffort: 'low',
}

/** 插件配置：一个接管 `scripted` 路由、目录里有一个模型的适配器。 */
function pluginConfig(models: ScriptedModelConfig[] = [DEMO]): scripted.Config {
  return { providers: ['scripted'], models }
}

/** 造一条人类消息。 */
function prompt(text: string): ReturnType<typeof createUserMessage> {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

/** 直接打到 LLM seam 的请求。 */
function seamOptions(text: string): GenerateOptions {
  return { provider: 'scripted', model: 'demo', messages: [prompt(text)] }
}

/** 只挂 LLM 运行时。 */
async function llmContext(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  return ctx
}

/** 挂 LLM 运行时 + 包不变量（用来验证流协议真的被强制）。 */
async function invariantContext(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(InvariantRegistry)
  await ctx.plugin(LlmInvariant as never)
  await ctx.plugin(LlmRuntime)
  return ctx
}

/** 端到端：testkit 先决依赖 + 被测插件 + 生产 AgentLoop。 */
async function loopContext(beforeLoop?: (ctx: Context) => void): Promise<Context> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  beforeLoop?.(ctx)
  await ctx.plugin(scripted as never, pluginConfig())
  await mountAgentLoopTestHarness(ctx)
  return ctx
}

/** 把一条流读干。 */
async function drain(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

/** 会话里已经结算的助手消息，按发生顺序。 */
function settlements(agent: Agent): { message: { content: unknown }; usage?: unknown; stream: { type: string }[] }[] {
  return agent.session.snapshotEvents().flatMap(event => event.type === 'assistant/message' ? [event.data] : [])
}

describe('离线模型适配器：端到端', () => {
  it('文本回合走完整链路，装配出助手消息、用量与分片记录', async () => {
    const ctx = await loopContext()
    const agent = await ctx.agentLoop.create(SessionId('text-round'), { provider: 'scripted', model: 'demo' })

    agent.followup(prompt('你好'))
    await agent.whenIdle()

    const [settled] = settlements(agent)
    expect(settled?.message.content).toEqual([{ type: 'text', text: '[scripted] 你好' }])
    // 会话里记的不是适配器原样的分片，而是无损打包后的形态：连续的 delta 折成
    // 一条 `text-chunks` 运行记录，其余（块启停、用量、终止）仍是裸 `chunk`。
    expect(settled?.stream.map(row => row.type))
      .toEqual(['chunk', 'text-chunks', 'chunk', 'chunk', 'chunk'])
    expect(settled?.usage).toMatchObject({ outputTokens: '[scripted] 你好'.length })
  })

  it('工具调用回合跑两轮：参数保持原始 JSON，工具结果回到模型', async () => {
    const ctx = await loopContext(inner => {
      inner.tools.register(defineTool({
        name: 'echo',
        description: 'Echo the given text back.',
        parameters: { text: { type: 'string', required: true, description: 'Text to echo' } },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        execute: async args => args.text,
      }))
    })
    const agent = await ctx.agentLoop.create(SessionId('tool-round'), { provider: 'scripted', model: 'demo' })

    agent.followup(prompt('tool:echo {"text":"hi"}'))
    await agent.whenIdle()

    const settled = settlements(agent)
    expect(settled).toHaveLength(2)
    const call = (settled[0]?.message.content as { type: string; name?: string; arguments?: string }[])
      .find(block => block.type === 'tool-call')
    expect(call).toMatchObject({ type: 'tool-call', name: 'echo', arguments: '{"text":"hi"}' })
    expect(agent.session.snapshotEvents().some(event => event.type === 'tool/result')).toBe(true)
    expect(settled[1]?.message.content).toEqual([{ type: 'text', text: '[scripted] tool returned hi' }])
  })

  it('历史末尾是 harness 自己注入的 user 消息时，回显的仍是人类那句', async () => {
    const ctx = await llmContext()
    await ctx.plugin(scripted as never, pluginConfig())
    const injected = createUserMessage({
      content: [{ type: 'text', text: '这是一段插件注入的提醒' }],
      source: { kind: 'plugin', plugin: 'demo' },
    })

    const chunks = await drain(ctx.llm.stream({ ...seamOptions('你好'), messages: [prompt('你好'), injected] }))

    const text = chunks.flatMap(chunk => chunk.type === 'text-delta' ? [chunk.text] : []).join('')
    expect(text).toBe('[scripted] 你好')
  })

  it('思考块与文本块按首次出现顺序编号', async () => {
    const ctx = await llmContext()
    await ctx.plugin(scripted as never, pluginConfig())

    const chunks = await drain(ctx.llm.stream(seamOptions('think:先想一下')))

    expect(chunks.map(chunk => chunk.type)).toEqual([
      'block-start', 'reasoning-delta', 'block-end',
      'block-start', 'text-delta', 'block-end',
      'usage', 'finish',
    ])
    expect(chunks.flatMap(chunk => chunk.type === 'block-start' ? [chunk.index] : [])).toEqual([0, 1])
  })
})

describe('离线模型适配器：流协议与故障路径', () => {
  it('finish 之后还发分片，会被 llm/stream 上的包不变量拦下', async () => {
    /** 故意违规的适配器：终止分片之后再发一个 delta。 */
    class MalformedAdapter extends ScriptedAdapter {
      override async *stream(): AsyncIterable<StreamChunk> {
        const text = 'ok'
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text }
        yield { type: 'block-end', index: 0, block: { type: 'text', text } }
        yield { type: 'finish', reason: { kind: 'stop' } }
        yield { type: 'text-delta', index: 0, text: 'after finish' }
      }
    }
    const ctx = await invariantContext()
    ctx.llm.registerAdapter(['malformed'], new MalformedAdapter())

    await expect(drain(ctx.llm.stream({ ...seamOptions('你好'), provider: 'malformed' })))
      .rejects.toThrow(/after terminal finish/u)
  })

  it('对流中途取消：半截内容被保留并标记为打断，agent 回到 idle', async () => {
    const ctx = await loopContext()
    const agent = await ctx.agentLoop.create(SessionId('cancel-round'), { provider: 'scripted', model: 'demo' })
    let chunks = 0
    ctx.on('agent/assistant-stream', ({ frame }) => { if (frame.type === 'chunk') chunks += 1 })

    agent.followup(prompt('hang:'))
    // 等第一个分片真的落地再取消，否则取消会早于任何内容，会话里不会留下打断的结算。
    await vi.waitFor(() => { expect(chunks).toBeGreaterThan(0) })
    agent.cancel({ kind: 'user' })
    await agent.whenIdle()

    expect(agent.status).toBe('idle')
    expect(settlements(agent)[0]).toMatchObject({
      interrupted: true,
      message: { content: [{ type: 'text', text: 'partial' }] },
    })
  })

  it('适配器抛 LlmError 时，消费方看到的是规范化后的 error finish', async () => {
    const ctx = await llmContext()
    await ctx.plugin(scripted as never, pluginConfig())

    const chunks = await drain(ctx.llm.stream(seamOptions('fail:RATE_LIMIT 手滑了')))

    expect(chunks.at(-1)).toEqual({
      type: 'finish',
      reason: { kind: 'error', failure: { message: '手滑了', code: 'RATE_LIMIT' } },
    })
  })

  it('提供方带内故障直接以 error finish 收流', async () => {
    const ctx = await llmContext()
    await ctx.plugin(scripted as never, pluginConfig())

    const chunks = await drain(ctx.llm.stream(seamOptions('provider-fail:OVERLOADED 服务端过载')))

    expect(chunks).toEqual([
      { type: 'finish', reason: { kind: 'error', failure: { code: 'OVERLOADED', message: '服务端过载' } } },
    ])
  })

  it('离线模型不支持的 stop 序列报 UNSUPPORTED_OPTION，不静默丢弃', async () => {
    const ctx = await llmContext()
    const adapter = new ScriptedAdapter([DEMO])
    ctx.llm.registerAdapter(['scripted'], adapter)

    const chunks = await drain(ctx.llm.stream({ ...seamOptions('你好'), stop: ['\n'] }))

    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { code: 'UNSUPPORTED_OPTION' } },
    })
    expect(adapter.requests).toHaveLength(1)
  })

  it('空响应按内核分类报 EMPTY_RESPONSE', async () => {
    const ctx = await llmContext()
    await ctx.plugin(scripted as never, pluginConfig())

    const chunks = await drain(ctx.llm.stream(seamOptions('empty:')))

    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { code: 'EMPTY_RESPONSE' } },
    })
  })

  it('流中途 abort，终态是 aborted finish 而不是抛给消费方', async () => {
    const ctx = await llmContext()
    const adapter = new ScriptedAdapter([DEMO])
    ctx.llm.registerAdapter(['scripted'], adapter)
    const controller = new AbortController()
    const chunks: StreamChunk[] = []

    const consuming = (async (): Promise<void> => {
      for await (const chunk of ctx.llm.stream({ ...seamOptions('hang:'), signal: controller.signal })) {
        chunks.push(chunk)
      }
    })()
    await vi.waitFor(() => { expect(adapter.requests).toHaveLength(1) })
    controller.abort()
    await consuming

    const last = chunks.at(-1)
    expect(last?.type === 'finish' ? last.reason.kind : undefined).toBe('aborted')
    expect(chunks.map(chunk => chunk.type)).toEqual(['block-start', 'text-delta', 'finish'])
  })
})

describe('离线模型适配器：模型能力与注册', () => {
  it('显式指定不支持的 reasoning 强度时，stream() 根本不会被调用', async () => {
    const ctx = await llmContext()
    const adapter = new ScriptedAdapter([DEMO])
    ctx.llm.registerAdapter(['scripted'], adapter)

    const failure = await ctx.llm
      .prepareCall({ provider: 'scripted', model: 'demo', reasoningEffort: ReasoningEffortId('extreme') })
      .then(() => undefined, (error: unknown) => error as { code?: string })

    expect(failure?.code).toBe('UNSUPPORTED_REASONING_EFFORT')
    expect(adapter.requests).toHaveLength(0)
  })

  it('调用方省略强度时，落到适配器声明的默认值', async () => {
    const ctx = await llmContext()
    ctx.llm.registerAdapter(['scripted'], new ScriptedAdapter([DEMO]))

    await expect(ctx.llm.resolveCallConfig({ provider: 'scripted', model: 'demo' }))
      .resolves.toMatchObject({ reasoningEffort: 'low' })
  })

  it('浏览器模型选择器的数据源里能看到这个提供方与模型', async () => {
    const ctx = await llmContext()
    await ctx.plugin(scripted as never, pluginConfig())

    // buildModelCatalog 是 web 侧模型选择器的 host 数据源，这里用同一个函数验证可见性。
    const catalog = await buildModelCatalog(ctx, { provider: 'scripted', model: 'demo' })

    expect(catalog.groups).toEqual([{
      id: 'scripted',
      name: 'Scripted (scripted)',
      models: [{
        id: 'demo',
        name: 'Scripted demo',
        reasoning: {
          efforts: [{ id: 'off', name: 'off' }, { id: 'low', name: 'low' }, { id: 'high', name: 'high' }],
          defaultEffort: 'low',
        },
      }],
    }])
    expect(catalog.routableProviders).toEqual(['scripted'])
    expect(catalog.failures).toEqual([])
  })

  it('目录与能力各自独立：目录外的 id 接受，声明的能力原样透出', async () => {
    const ctx = await llmContext()
    ctx.llm.registerAdapter(['scripted'], new ScriptedAdapter([DEMO]))

    // 目录是展示用的（可选项，且不包含上下文窗口）；未列出的 id 照样接受
    await expect(ctx.llm.listModels('scripted')).resolves.toEqual([
      { provider: 'scripted', id: 'demo', name: 'Scripted demo' },
    ])
    await expect(ctx.llm.resolveModelInfo('scripted', 'not-in-catalog'))
      .resolves.toEqual({ provider: 'scripted', id: 'not-in-catalog', name: 'not-in-catalog' })

    // 精确模型元数据里才有上下文窗口，reasoning 列表按声明顺序原样透出，包括 off
    await expect(ctx.llm.resolveModelInfo('scripted', 'demo')).resolves.toMatchObject({
      context: { contextWindow: 32000 },
      reasoning: {
        efforts: [{ id: 'off' }, { id: 'low' }, { id: 'high' }],
        defaultEffort: 'low',
      },
    })
  })

  it('同一路由只能有一个适配器，replace 原子换路由，释放后不能再换', async () => {
    const ctx = await llmContext()
    const handle = ctx.llm.registerAdapter(['one'], new ScriptedAdapter())

    const duplicate = ((): { code?: string } | undefined => {
      try {
        ctx.llm.registerAdapter(['one'], new ScriptedAdapter())
        return undefined
      } catch (error: unknown) {
        return error as { code?: string }
      }
    })()
    expect(duplicate?.code).toBe('DUPLICATE_ADAPTER')

    handle.replace(['two'])
    expect(ctx.llm.listProviders().map(provider => provider.id)).toEqual(['two'])

    handle()
    const disposed = ((): { code?: string } | undefined => {
      try {
        handle.replace(['three'])
        return undefined
      } catch (error: unknown) {
        return error as { code?: string }
      }
    })()
    expect(disposed?.code).toBe('REGISTRATION_DISPOSED')
    expect(ctx.llm.listProviders()).toEqual([])
  })
})

describe('拦截图层：敏感词门禁', () => {
  /** 挂上适配器 + 门禁，并留下适配器引用以便断言「模型有没有被调用」。 */
  async function guardContext(options: { purpose?: GenerateOptions['purpose'] } = {}): Promise<{
    ctx: Context
    adapter: ScriptedAdapter
    stream: (text: string) => Promise<StreamChunk[]>
  }> {
    const ctx = await llmContext()
    const adapter = new ScriptedAdapter([DEMO])
    ctx.llm.registerAdapter(['scripted'], adapter)
    await ctx.plugin(guard as never, { words: ['权限', '密码'], refusal: '非法内容，请重新输入。' })
    return {
      ctx,
      adapter,
      stream: text => drain(ctx.llm.stream({
        ...seamOptions(text),
        ...options.purpose === undefined ? {} : { purpose: options.purpose },
      })),
    }
  }

  it('命中敏感词时直接拒绝，适配器一次都不会被调用', async () => {
    const { adapter, stream } = await guardContext()

    const chunks = await stream('帮我看看这个权限配置')

    expect(chunks.map(chunk => chunk.type)).toEqual(['block-start', 'text-delta', 'block-end', 'finish'])
    const text = chunks.flatMap(chunk => chunk.type === 'text-delta' ? [chunk.text] : []).join('')
    expect(text).toBe('非法内容，请重新输入。（命中：权限）')
    expect(adapter.requests).toHaveLength(0)
  })

  it('没命中就正常走模型', async () => {
    const { adapter, stream } = await guardContext()

    const chunks = await stream('你好')

    expect(adapter.requests).toHaveLength(1)
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
  })

  it('后台辅助调用（压缩、起标题）不设门禁', async () => {
    const { adapter, stream } = await guardContext({ purpose: 'compaction' })

    await stream('把这段权限记录压缩一下')

    expect(adapter.requests).toHaveLength(1)
  })

  it('敏感词只出现在工具结果里时不拦', async () => {
    const { ctx, adapter } = await guardContext()
    const toolResult = createUserMessage({
      content: [{ type: 'tool-result', toolCallId: ToolCallId('call-1'), content: [{ type: 'text', text: '权限校验通过' }] }],
      source: { kind: 'user' },
    })

    await drain(ctx.llm.stream({ ...seamOptions('你好'), messages: [prompt('你好'), toolResult] }))

    expect(adapter.requests).toHaveLength(1)
  })

  it('拒绝流本身是一段合规的流，包不变量不会拦它', async () => {
    const ctx = await invariantContext()
    ctx.llm.registerAdapter(['scripted'], new ScriptedAdapter([DEMO]))
    await ctx.plugin(guard as never, { words: ['权限'], refusal: '非法内容，请重新输入。' })

    const chunks = await drain(ctx.llm.stream(seamOptions('查一下权限')))

    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
  })
})
