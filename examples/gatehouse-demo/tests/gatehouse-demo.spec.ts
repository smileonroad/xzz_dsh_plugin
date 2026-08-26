import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import ApprovalService, { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import type { Agent } from '@deepseek-ai/dsh-agent'
import * as keeper from '../src/gatekeeper.ts'
import * as facilities from '../src/facilities.ts'

const signal = new AbortController().signal

/**
 * A minimal Agent stand-in — the approval seam reaches `agent.session.events`
 * (fold) and `agent.session.append` (audit pair, policy), and `request()`'s
 * open-turn precondition reads the seeded `turn/start`. Append records the
 * `{ type, data }` shape real sessions use, so the tests can assert the
 * audit log afterwards.
 */
function fakeAgent(openTurn = true): Agent {
  const events: Array<{ type: string; data: Record<string, unknown> }> =
    openTurn ? [{ type: 'turn/start', data: { turn: 1 } }] : []
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

/**
 * Mount the real tool registry + system-prompt assembler + the real approval
 * service, then the gated facilities and (optionally) the keeper. A harness
 * without the keeper leaves the chain to whatever the test registers.
 */
async function harness(keeperConfig?: Record<string, unknown>): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  await ctx.plugin(ApprovalService)
  await ctx.plugin(facilities)
  if (keeperConfig !== undefined) await ctx.plugin(keeper, keeperConfig as never)
  return ctx
}

/** Dispatch one tool call through the registry pipeline, as the loop would. */
async function run(
  ctx: Context,
  name: string,
  args: Record<string, unknown> = {},
  agent: Agent = fakeAgent(),
): Promise<ToolExecutionResult> {
  return ctx.tools.execute({ signal, callId: CallId('c1'), name, arguments: args, agent })
}

describe('gatehouse-demo: approval answerer chain', () => {
  it('allow-listed tools pass straight through — allowed-once, nobody else is asked', async () => {
    const ctx = await harness({ allow: ['use_locker'], deny: ['open_vault'] })
    let otherAnswerers = 0
    ctx.on('approval/request', () => {
      otherAnswerers += 1
      return Promise.resolve<ApprovalOutcome>('rejected')
    })
    const result = await run(ctx, 'use_locker', { lockerId: 'A7' })
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({ opened: 'A7' })
    expect(otherAnswerers).toBe(0)
  })

  it('deny-listed tools are refused — rejected, nobody else is asked', async () => {
    const ctx = await harness({ allow: ['use_locker'], deny: ['open_vault'] })
    let otherAnswerers = 0
    ctx.on('approval/request', () => {
      otherAnswerers += 1
      return Promise.resolve<ApprovalOutcome>('allowed-once')
    })
    const result = await run(ctx, 'open_vault')
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('rejected') as string,
    })
    expect(otherAnswerers).toBe(0)
  })

  it('unlisted tools are delegated — the human answerer decides', async () => {
    const ctx = await harness({ allow: ['use_locker'], deny: ['open_vault'] })
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('allowed-once'))
    const allowed = await run(ctx, 'use_lab', { purpose: 'test samples' })
    expect(allowed.isError).toBe(false)
    expect(allowed.value).toEqual({ granted: 'test samples' })

    const ctx2 = await harness({ allow: ['use_locker'], deny: ['open_vault'] })
    ctx2.on('approval/request', () => Promise.resolve<ApprovalOutcome>('rejected'))
    const refused = await run(ctx2, 'use_lab', { purpose: 'test samples' })
    expect(refused.isError).toBe(true)
  })

  it('without any answerer the request fails closed — unavailable', async () => {
    const ctx = await harness({ allow: ['use_locker'], deny: ['open_vault'] })
    const result = await run(ctx, 'use_lab')
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('no approval channel') as string,
    })
  })

  it('a throwing answerer fails the question closed, not the caller open', async () => {
    const ctx = await harness({ allow: ['use_locker'], deny: ['open_vault'] })
    ctx.on('approval/request', () => {
      throw new Error('answerer gone')
    })
    const result = await run(ctx, 'use_lab')
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('no approval channel') as string,
    })
  })

  it('a rogue non-vocabulary answerer return is normalized to unavailable', async () => {
    const ctx = await harness({ allow: ['use_locker'], deny: ['open_vault'] })
    ctx.on('approval/request', () => Promise.resolve('maybe-allow' as unknown as ApprovalOutcome))
    const result = await run(ctx, 'use_lab')
    expect(result.isError).toBe(true)
  })

  it('the session "never" policy rejects before any answerer runs', async () => {
    const ctx = await harness({ allow: ['use_locker'], deny: ['open_vault'] })
    let answererCalls = 0
    ctx.on('approval/request', () => {
      answererCalls += 1
      return Promise.resolve<ApprovalOutcome>('allowed-once')
    })
    const agent = fakeAgent()
    setApprovalPolicy(agent.session, 'never')
    const result = await run(ctx, 'use_locker', { lockerId: 'A7' }, agent)
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('rejected') as string,
    })
    expect(answererCalls).toBe(0)
  })

  it('switching the policy back to ask resumes dispatch and logs approval/policy', async () => {
    const ctx = await harness({ allow: ['use_locker'], deny: ['open_vault'] })
    const agent = fakeAgent()
    setApprovalPolicy(agent.session, 'never')
    setApprovalPolicy(agent.session, 'ask')
    const result = await run(ctx, 'use_locker', { lockerId: 'A7' }, agent)
    expect(result.isError).toBe(false)
    const policy = ofType(agent, 'approval/policy')
    expect(policy).toHaveLength(2)
    expect(policy[0]?.data.policy).toBe('never')
    expect(policy[1]?.data.policy).toBe('ask')
  })

  it('records the asked/decided audit pair with one shared id', async () => {
    const ctx = await harness({ allow: ['use_locker'], deny: [] })
    const agent = fakeAgent()
    await run(ctx, 'use_locker', { lockerId: 'A7' }, agent)
    const asked = ofType(agent, 'approval/asked')
    const decided = ofType(agent, 'approval/decided')
    expect(asked).toHaveLength(1)
    expect(decided).toHaveLength(1)
    expect(asked[0]?.data.id).toBe(decided[0]?.data.id)
    expect(asked[0]?.data.toolName).toBe('use_locker')
    expect(asked[0]?.data.callId).toBe('c1')
    expect(decided[0]?.data.outcome).toBe('allowed-once')
  })

  it('asking outside an open turn throws before anything is logged', async () => {
    const ctx = await harness({ allow: ['use_locker'], deny: [] })
    const agent = fakeAgent(false)
    await expect(ctx.approval.request({ agent, toolName: 'use_locker' }))
      .rejects.toThrow(/outside an open turn/)
    expect(ofType(agent, 'approval/asked')).toHaveLength(0)
  })

  it('an aborted ask settles cancelled and a late answer is discarded', async () => {
    const ctx = await harness({ allow: ['use_locker'], deny: [] })
    const controller = new AbortController()
    let release: (outcome: ApprovalOutcome) => void = () => {}
    ctx.on('approval/request', () => new Promise<ApprovalOutcome>(resolve => {
      release = resolve
    }))
    const agent = fakeAgent()
    const asked = ctx.approval.request({ agent, toolName: 'use_lab', signal: controller.signal })
    controller.abort()
    await expect(asked).resolves.toBe('cancelled')
    release('allowed-once')
    expect(ofType(agent, 'approval/decided')[0]?.data.outcome).toBe('cancelled')
  })

  it('registration order decides who answers first', async () => {
    const ctx = await harness()
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('rejected'))
    await ctx.plugin(keeper, { allow: ['use_locker'], deny: [] } as never)
    const result = await run(ctx, 'use_locker', { lockerId: 'A7' })
    expect(result.isError).toBe(true)
  })

  it('prepend moves the keeper to the front of the chain', async () => {
    const ctx = await harness()
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('rejected'))
    await ctx.plugin(keeper, { allow: ['use_locker'], deny: [], prepend: true } as never)
    const result = await run(ctx, 'use_locker', { lockerId: 'A7' })
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({ opened: 'A7' })
  })

  it('unmounting the keeper restores the delegation chain', async () => {
    const ctx = await harness()
    const fiber = await ctx.plugin(keeper, { allow: ['use_locker'], deny: [] } as never)
    ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>('rejected'))
    await fiber.dispose()
    const result = await run(ctx, 'use_locker', { lockerId: 'A7' })
    expect(result.isError).toBe(true)
  })

  it('gates only its own facilities — other tools pass pre-execute untouched', async () => {
    const ctx = await harness({ allow: ['use_locker'], deny: [] })
    ctx.tools.register(defineTool({
      name: 'ring_bell',
      description: 'ring the gatehouse bell',
      parameters: {},
      output: { schema: { type: 'string' }, render: () => [] },
      execute: async () => 'ding-dong',
    }))
    let asks = 0
    ctx.on('approval/request', () => {
      asks += 1
      return Promise.resolve<ApprovalOutcome>('rejected')
    })
    const result = await run(ctx, 'ring_bell')
    expect(result.isError).toBe(false)
    expect(asks).toBe(0)
  })

  it('without the approval service the ask degrades to an explicit deny', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime, { mode: 'native' })
    await ctx.plugin(facilities)
    const result = await run(ctx, 'use_locker', { lockerId: 'A7' })
    expect(result.isError).toBe(true)
  })

  it('the keeper stays dormant when the approval service is not composed', async () => {
    // inject gating, not fail-loud: without ctx.approval the keeper's
    // callback never activates and the chain answers as if it were absent.
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime, { mode: 'native' })
    await ctx.plugin(facilities)
    await ctx.plugin(keeper, { allow: ['use_locker'], prepend: true } as never)
    const result = await run(ctx, 'use_locker', { lockerId: 'A7' })
    expect(result.isError).toBe(true)
    // serviceAsk degrades to deny and reports the ask reason as the error.
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('storage locker') as string,
    })
  })

  it('exposes Loader-safe exports', () => {
    expect(keeper.name).toBe('gatehouse-keeper')
    expect(keeper.inject).toEqual(['approval'])
    expect(keeper.Config).toBeDefined()
    expect(facilities.name).toBe('gatehouse-facilities')
    expect(facilities.inject).toEqual(['tools'])
    expect('default' in keeper).toBe(false)
    expect('default' in facilities).toBe(false)
  })
})
