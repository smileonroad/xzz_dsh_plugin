import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import * as machine from '../src/machine.ts'

const signal = new AbortController().signal

/**
 * A minimal Agent stand-in. The machine only reaches `agent.session.append`,
 * so `{ session: { events, append } }` is all it needs; append records the
 * `{ type, data }` shape real sessions use so the tests can assert the log.
 */
function fakeAgent(): Agent {
  const events: Array<{ type: string; data: Record<string, unknown> }> = []
  return {
    session: {
      events: events as unknown as Agent['session']['events'],
      append: (type: string, data: Record<string, unknown>) => { events.push({ type, data }) },
    },
  } as unknown as Agent
}

/** Events of one type from a fake agent's session log. */
function ofType(agent: Agent, type: string): Array<{ type: string; data: Record<string, unknown> }> {
  return (agent.session.events as unknown as Array<{ type: string; data: Record<string, unknown> }>)
    .filter(event => event.type === type)
}

/** Mount the real tool registry + system-prompt assembler + the machine. */
async function harness(): Promise<{ ctx: Context; fiber: Awaited<ReturnType<Context['plugin']>> }> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  const fiber = await ctx.plugin(machine)
  return { ctx, fiber }
}

/** Dispatch one tool call through the registry pipeline, as the loop would. */
async function run(
  ctx: Context,
  args: Record<string, unknown> = {},
  agent: Agent = fakeAgent(),
): Promise<ToolExecutionResult> {
  return ctx.tools.execute({ signal, callId: CallId('c1'), name: 'laundry_start', arguments: args, agent })
}

describe('laundry-machine: the Host half', () => {
  afterEach(() => { vi.useRealTimers() })

  it('appends laundry/start first, with a stable id and the default title', async () => {
    const { ctx } = await harness()
    const agent = fakeAgent()
    const result = await run(ctx, {}, agent)

    expect(result.isError).toBe(false)
    expect(result.value).toEqual({ laundryId: 'laundry-1', title: '日常衣物', status: 'running' })
    expect(ofType(agent, 'laundry/start')).toHaveLength(1)
    expect(ofType(agent, 'laundry/start')[0]?.data).toEqual({ laundryId: 'laundry-1', title: '日常衣物' })
  })

  it('runs the full cycle in order — start → steps × progress → done, nothing else', async () => {
    vi.useFakeTimers()
    const { ctx } = await harness()
    const agent = fakeAgent()
    await run(ctx, { steps: 3, interval_ms: 100 }, agent)
    vi.advanceTimersByTime(400) // 3 ticks at 100 ms + the done at 400 ms

    const events = agent.session.events as unknown as Array<{ type: string; data: Record<string, unknown> }>
    expect(events.map(event => event.type)).toEqual([
      'laundry/start',
      'laundry/progress',
      'laundry/progress',
      'laundry/progress',
      'laundry/done',
    ])
    expect(ofType(agent, 'laundry/progress').map(event => event.data.completed)).toEqual([33, 66, 99])
    expect(ofType(agent, 'laundry/done')[0]?.data).toEqual({
      laundryId: 'laundry-1',
      summary: '日常衣物 洗好了，香喷喷的',
    })
  })

  it('progress ticks land at their scheduled times', async () => {
    vi.useFakeTimers()
    const { ctx } = await harness()
    const agent = fakeAgent()
    await run(ctx, { steps: 2, interval_ms: 100 }, agent)

    vi.advanceTimersByTime(100)
    expect(ofType(agent, 'laundry/progress').map(event => event.data.completed)).toEqual([50])

    vi.advanceTimersByTime(100)
    expect(ofType(agent, 'laundry/progress').map(event => event.data.completed)).toEqual([50, 99])
    expect(ofType(agent, 'laundry/done')).toHaveLength(0)

    vi.advanceTimersByTime(100)
    expect(ofType(agent, 'laundry/done')).toHaveLength(1)
  })

  it('honours item / steps / interval_ms args', async () => {
    vi.useFakeTimers()
    const { ctx } = await harness()
    const agent = fakeAgent()
    const result = await run(ctx, { item: '一件衬衫', steps: 2, interval_ms: 50 }, agent)
    vi.advanceTimersByTime(150)

    expect(result.isError).toBe(false)
    expect(ofType(agent, 'laundry/start')[0]?.data).toEqual({ laundryId: 'laundry-1', title: '一件衬衫' })
    expect(ofType(agent, 'laundry/done')[0]?.data).toEqual({
      laundryId: 'laundry-1',
      summary: '一件衬衫 洗好了，香喷喷的',
    })
  })

  it('throws without a live agent — the call fails loud', async () => {
    const { ctx } = await harness()
    const result = await ctx.tools.execute({
      signal,
      callId: CallId('c1'),
      name: 'laundry_start',
      arguments: {},
      agent: undefined,
    })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('agent session') as string,
    })
  })

  it('rejects invalid steps and interval', async () => {
    const { ctx } = await harness()
    for (const args of [{ steps: 0 }, { steps: 1.5 }, { steps: 101 }, { interval_ms: -1 }]) {
      const result = await run(ctx, args)
      expect(result.isError).toBe(true)
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('laundry_start') as string,
      })
    }
  })

  it('disposing the plugin cancels a running cycle', async () => {
    vi.useFakeTimers()
    const { ctx, fiber } = await harness()
    const agent = fakeAgent()
    await run(ctx, { steps: 4, interval_ms: 100 }, agent)

    vi.advanceTimersByTime(100)
    expect(ofType(agent, 'laundry/progress')).toHaveLength(1)

    await fiber.dispose()
    vi.advanceTimersByTime(10_000)
    expect(ofType(agent, 'laundry/progress')).toHaveLength(1)
    expect(ofType(agent, 'laundry/done')).toHaveLength(0)
  })

  it('exposes Loader-safe exports', () => {
    expect(machine.name).toBe('laundry-machine')
    expect(machine.inject).toEqual(['tools'])
    expect(typeof machine.apply).toBe('function')
    expect('default' in machine).toBe(false)
  })
})
