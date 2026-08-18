import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentStatus } from '@deepseek-ai/dsh-agent'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import * as helloworldCommand from '../src/index.ts'

/** Build a live idle agent the command executor can log lifecycle events on. */
function stubAgent(ctx: Context, id: string): { agent: Agent; session: Session } {
  const session = ctx.sessions.create(SessionId(id))
  const inbox = new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} })
  let status: AgentStatus = 'idle'
  const agent: Agent = {
    id: session.id,
    options: {},
    session,
    inbox,
    ctx: new Context(),
    get status() { return status },
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject() {},
    cancel() { status = 'idle' },
    runMaintenance: task => task(new AbortController().signal),
    whenIdle() { return Promise.resolve() },
  }
  return { agent, session }
}

/** Execute `/helloworld` through the same registry boundary as a UI adapter. */
async function run(
  test: { ctx: Context; agent: Agent },
  suffix = '',
): Promise<NonNullable<Awaited<ReturnType<CommandRuntime['execute']>>>['result']> {
  const execution = await test.ctx.commands.execute(
    test.agent,
    `/helloworld${suffix}`,
    new AbortController().signal,
  )
  if (execution === undefined) throw new Error('helloworld command was not registered')
  return execution.result
}

/** Mount the real command registry and session store, then the demo plugin. */
async function harness(): Promise<{ ctx: Context; agent: Agent; session: Session }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(CommandRuntime)
  await ctx.plugin(AgentRegistry)
  const { agent, session } = stubAgent(ctx, `helloworld-command-${Math.random()}`)
  ctx.agents.register(agent)
  await ctx.plugin(helloworldCommand)
  return { ctx, agent, session }
}

describe('helloworld-command example plugin', () => {
  it('registers one global command with Loader-safe exports and disposes it', async () => {
    const test = await harness()
    expect(helloworldCommand.name).toBe('helloworld-command')
    expect(helloworldCommand.inject).toEqual(['commands'])
    expect('default' in helloworldCommand).toBe(false)

    expect(test.ctx.commands.list(test.agent)).toContainEqual({
      name: 'helloworld',
      description: 'greet the user with an optional name',
      input: { hint: '[<name>]' },
    })

    // Same-scope duplicate registration fails loud rather than shadowing.
    expect(() => test.ctx.commands.register({
      name: 'helloworld',
      description: 'duplicate registration must throw',
      handler: () => ({ kind: 'success' as const }),
    })).toThrow(/command "helloworld" is already registered/)
  })

  it('greets without input', async () => {
    const test = await harness()
    const result = await run(test)
    expect(result).toEqual({ kind: 'success', text: 'Hello! I am the dsh harness.' })
  })

  it('greets a named target', async () => {
    const test = await harness()
    const result = await run(test, ' Claude')
    expect(result).toEqual({ kind: 'success', text: 'Hello, Claude! Nice to meet you.' })
  })

  it('rejects multi-word input with a usage error', async () => {
    const test = await harness()
    const result = await run(test, ' Jane Doe')
    expect(result).toEqual({
      kind: 'error',
      text: 'Usage: /helloworld [<name>] — a single word name, no spaces.',
    })
  })

  it('logs command/run and command/done lifecycle events', async () => {
    const test = await harness()
    await run(test, ' Claude')
    const types = test.session.events.filter(e => e.type === 'command/run' || e.type === 'command/done')
    expect(types).toHaveLength(2)
    // The payload lives in `event.data`; the envelope carries type/seq/time.
    expect(types[0]).toMatchObject({ type: 'command/run', data: { name: 'helloworld', args: ' Claude' } })
    expect(types[1]).toMatchObject({ type: 'command/done', data: { kind: 'success' } })
  })

  it('admission misses log nothing', async () => {
    const test = await harness()
    const missing = await test.ctx.commands.execute(test.agent, '/nope', new AbortController().signal)
    expect(missing).toBeUndefined()
    expect(test.session.events).toHaveLength(0)
  })
})
