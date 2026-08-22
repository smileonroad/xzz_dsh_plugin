import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { CallId } from '@deepseek-ai/dsh-llm'
import * as toolPolicy from '../src/tool-policy.ts'
import * as toolObserver from '../src/tool-observer.ts'

/**
 * Test-fixture events for the serial / bail / parallel distribution modes.
 * The real harness events are almost all `emit` or `waterfall`, so the three
 * remaining modes are declared here and driven directly (the example itself
 * deliberately declares no events of its own — see the proposal).
 */
declare module '@deepseek-ai/cordis' {
  interface Events {
    'demo/pick'(value: string): string | undefined | Promise<string | undefined>
    'demo/async'(): void | Promise<void>
  }
}

const signal = new AbortController().signal

/** Mount the real tool registry + system-prompt assembler, then the plugins under test. */
async function toolHarness(plugins: unknown[]): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  for (const plugin of plugins) await ctx.plugin(plugin as never)
  ctx.tools.register(defineTool({
    name: 'echo',
    description: 'echo back the given text',
    parameters: { text: { type: 'string', required: true, description: 'text to echo' } },
    output: { schema: { type: 'object', properties: { echoed: { type: 'string' } }, additionalProperties: false }, render: () => [] },
    execute: async args => ({ echoed: args.text }),
  }))
  ctx.tools.register(defineTool({
    name: 'dangerous_tool',
    description: 'demo tool on the policy block list',
    parameters: {},
    output: { schema: { type: 'string' }, render: () => [] },
    execute: async () => 'ran',
  }))
  return ctx
}

/** Dispatch one tool call through the registry pipeline, as the agent loop would. */
async function execute(
  ctx: Context,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolExecutionResult> {
  return ctx.tools.execute({ signal, callId: CallId('call-1'), name, arguments: args })
}

describe('events-demo: real harness events', () => {
  it('listens to the real commands/change emit event', async () => {
    const ctx = new Context()
    await ctx.plugin(CommandRuntime)
    let changed = 0
    ctx.on('commands/change', () => {
      changed += 1
    })
    const dispose = ctx.commands.register({
      name: 'greet',
      description: 'demo command',
      handler: () => ({ kind: 'success' as const, text: 'hi' }),
    })
    expect(changed).toBe(1)
    dispose()
    expect(changed).toBe(2)
  })

  it('ctx.on returns a disposer that removes the listener', async () => {
    const ctx = new Context()
    await ctx.plugin(CommandRuntime)
    let changed = 0
    const stop = ctx.on('commands/change', () => {
      changed += 1
    })
    const disposeA = ctx.commands.register({
      name: 'a',
      description: 'demo command',
      handler: () => ({ kind: 'success' as const, text: 'a' }),
    })
    expect(changed).toBe(1)
    stop()
    disposeA()
    expect(changed).toBe(1) // listener gone: the unregister did not reach it
    const disposeB = ctx.commands.register({
      name: 'b',
      description: 'demo command',
      handler: () => ({ kind: 'success' as const, text: 'b' }),
    })
    expect(changed).toBe(1)
    disposeB()
  })

  it('tool-policy denies the blocked tool and lets others through', async () => {
    const ctx = await toolHarness([toolPolicy])
    const denied = await execute(ctx, 'dangerous_tool')
    expect(denied.isError).toBe(true)
    expect(denied.content[0]).toMatchObject({
      text: expect.stringContaining('denied by the demo policy') as string,
    })
    const ok = await execute(ctx, 'echo', { text: 'hi' })
    expect(ok.isError).toBe(false)
    expect(ok.value).toEqual({ echoed: 'hi' })
  })

  it('a good observer delegates, so the decider still applies', async () => {
    const ctx = await toolHarness([toolObserver, toolPolicy])
    const denied = await execute(ctx, 'dangerous_tool')
    expect(denied.isError).toBe(true)
    const ok = await execute(ctx, 'echo', { text: 'hi' })
    expect(ok.isError).toBe(false)
    expect(ok.value).toEqual({ echoed: 'hi' })
  })

  it('an observer that forgets next() short-circuits the decider (discipline)', async () => {
    const ctx = await toolHarness([])
    // Bad observer registered FIRST (outermost): returns allow, never calls next().
    ctx.on('tools/pre-execute', async () => ({ kind: 'allow' } as const))
    await ctx.plugin(toolPolicy)
    const result = await execute(ctx, 'dangerous_tool')
    // The policy never ran: the blocked tool executes anyway.
    expect(result.isError).toBe(false)
    expect(result.value).toBe('ran')
  })
})

describe('events-demo: distribution modes (test fixtures)', () => {
  it('serial runs listeners in order and stops at the first bail value', async () => {
    const ctx = new Context()
    const order: string[] = []
    ctx.on('demo/pick', async value => {
      order.push('a')
      return value === 'stop' ? 'A-WINS' : undefined
    })
    ctx.on('demo/pick', async () => {
      order.push('b')
      return 'B-WINS'
    })
    const result = await ctx.serial('demo/pick', 'stop')
    expect(result).toBe('A-WINS')
    expect(order).toEqual(['a']) // the second listener never ran
  })

  it('serial runs every listener when none returns a bail value', async () => {
    const ctx = new Context()
    const order: string[] = []
    ctx.on('demo/pick', async () => {
      order.push('a')
      return undefined
    })
    ctx.on('demo/pick', async () => {
      order.push('b')
      return undefined
    })
    const result = await ctx.serial('demo/pick', 'go')
    expect(result).toBeUndefined()
    expect(order).toEqual(['a', 'b'])
  })

  it('bail is the synchronous serial', () => {
    const ctx = new Context()
    const order: string[] = []
    ctx.on('demo/pick', value => {
      order.push('a')
      return value === 'stop' ? 'A-WINS' : undefined
    })
    ctx.on('demo/pick', () => {
      order.push('b')
      return 'B-WINS'
    })
    const result = ctx.bail('demo/pick', 'stop')
    expect(result).toBe('A-WINS')
    expect(order).toEqual(['a'])
  })

  it('parallel runs every listener concurrently and awaits them all', async () => {
    const ctx = new Context()
    let ran = 0
    ctx.on('demo/async', async () => {
      await new Promise(resolve => setTimeout(resolve, 5))
      ran += 1
    })
    ctx.on('demo/async', async () => {
      await new Promise(resolve => setTimeout(resolve, 5))
      ran += 1
    })
    await ctx.parallel('demo/async')
    expect(ran).toBe(2)
  })
})

describe('events-demo: Loader-safe exports', () => {
  it('registers one plugin per role with Loader-safe exports', () => {
    expect(toolPolicy.name).toBe('events-demo-tool-policy')
    expect(toolPolicy.inject).toEqual(['tools'])
    expect(toolObserver.name).toBe('events-demo-tool-observer')
    expect(toolObserver.inject).toEqual(['tools'])
    expect('default' in toolPolicy).toBe(false)
    expect('default' in toolObserver).toBe(false)
  })
})
