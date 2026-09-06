import { describe, expect, it, vi } from 'vitest'
import type { SessionEventLikeEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import {
  ConversationNodeAssembler,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {
  ConversationNodeDefinition, ConversationViewDefinition, ConversationViewNode,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SessionSeq } from '@deepseek-ai/dsh-session/types'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { laundryDefinition } from '../src/client/definition.ts'

interface TestSnapshot {
  readonly order: readonly string[]
  readonly nodes: ReadonlyMap<string, ConversationViewNode>
}

class TestEventDefinitions {
  constructor(readonly definitions: readonly ConversationNodeDefinition[]) {}

  entries(): readonly ConversationNodeDefinition[] {
    return this.definitions
  }

  fallbackEntry(): ConversationNodeDefinition | undefined {
    return undefined
  }
}

class TestViewDefinitions {
  constructor(readonly definitions: readonly ConversationViewDefinition[]) {}

  entries(): readonly ConversationViewDefinition[] {
    return this.definitions
  }
}

function testView(
  apply = vi.fn(),
): ConversationViewDefinition<ConversationViewNode, TestSnapshot> {
  return {
    target: 'chat',
    create: () => {
      let current: TestSnapshot = { order: [], nodes: new Map() }
      return {
        empty: current,
        replace: ({ nodes }) => {
          current = { order: nodes.map(node => node.key), nodes: new Map(nodes.map(node => [node.key, node])) }
          return current
        },
        apply: ({ upserts }) => {
          apply(upserts)
          const nodes = new Map(current.nodes)
          const order = [...current.order]
          for (const node of upserts) {
            if (!nodes.has(node.key)) order.push(node.key)
            nodes.set(node.key, node)
          }
          current = { order, nodes }
          return current
        },
      }
    },
  }
}

function at(seq: number, type: string, data: unknown): SessionEvent {
  return { seq: SessionSeq(seq), time: 1_700_000_000_000 + seq, type, data } as SessionEvent
}

function input(event: SessionEvent): SessionEventLikeEntry {
  return { type: 'event', event }
}

/** An assembler with the chat target activated, the way the real shell does. */
function makeAssembler(
  definition: ConversationNodeDefinition = laundryDefinition,
  view = testView(),
): ConversationNodeAssembler {
  const assembler = new ConversationNodeAssembler(
    new TestEventDefinitions([definition]),
    new TestViewDefinitions([view]),
  )
  assembler.activateTarget('chat')
  return assembler
}

function chatSnapshot(assembler: ConversationNodeAssembler): TestSnapshot | undefined {
  return assembler.snapshot('chat') as TestSnapshot | undefined
}

function assemble(events: SessionEvent[], hasMore = false): ConversationNodeAssembler {
  const assembler = makeAssembler()
  assembler.replaceWindow(events.map(input), hasMore)
  assembler.flush()
  return assembler
}

/** One complete wash cycle (a: 衬衫), step 1 of turn 1, seq 3–5. */
function cycleA(): SessionEvent[] {
  return [
    at(1, 'turn/start', { turn: 1 }),
    at(2, 'step/start', { turn: 1, step: 1 }),
    at(3, 'laundry/start', { laundryId: 'a', title: '一件衬衫' }),
    at(4, 'laundry/progress', { laundryId: 'a', completed: 45 }),
    at(5, 'laundry/done', { laundryId: 'a', summary: '一件衬衫 洗好了，香喷喷的' }),
  ]
}

describe('laundry-definition: the Client Definition', () => {
  it('full replace produces the final node — state, location, anchorSeq', () => {
    const assembler = assemble(cycleA())
    const node = [...(chatSnapshot(assembler)?.nodes.values() ?? [])][0]

    expect(node?.kind).toBe('laundry-job')
    expect(node?.id).toBe('a')
    expect(node?.anchorSeq).toBe(3)
    expect(node?.location.kind).toBe('step')
    expect(node?.data).toEqual({
      title: '一件衬衫',
      completed: 100,
      status: 'completed',
      summary: '一件衬衫 洗好了，香喷喷的',
    })
  })

  it('an updates-only window stays pending; prepend the start yields the full result', () => {
    const assembler = makeAssembler()
    assembler.replaceWindow([
      input(at(4, 'laundry/progress', { laundryId: 'a', completed: 45 })),
      input(at(5, 'laundry/done', { laundryId: 'a', summary: '洗好了' })),
    ], true)
    assembler.flush()
    expect(chatSnapshot(assembler)?.order).toEqual([])

    assembler.prepend(cycleA().slice(0, 3).map(input), false)
    assembler.flush()

    const node = [...(chatSnapshot(assembler)?.nodes.values() ?? [])][0]
    expect(node?.data).toEqual({
      title: '一件衬衫',
      completed: 100,
      status: 'completed',
      summary: '洗好了',
    })
  })

  it('realtime append equals a full merged replay', () => {
    const live = makeAssembler()
    live.replaceWindow(cycleA().slice(0, 3).map(input), false)
    live.flush()
    for (const event of cycleA().slice(3)) {
      live.append(input(event))
      live.flush()
    }
    const liveData = [...(chatSnapshot(live)?.nodes.values() ?? [])][0]?.data

    const replayed = assemble(cycleA())
    const replayedData = [...(chatSnapshot(replayed)?.nodes.values() ?? [])][0]?.data

    expect(liveData).toEqual(replayedData)
    expect(liveData).toEqual({
      title: '一件衬衫',
      completed: 100,
      status: 'completed',
      summary: '一件衬衫 洗好了，香喷喷的',
    })
  })

  it('prepend adds only earlier rows and keeps the existing keyed node', () => {
    const assembler = assemble([
      at(5, 'laundry/start', { laundryId: 'a', title: '一件衬衫' }),
      at(6, 'laundry/progress', { laundryId: 'a', completed: 45 }),
      at(7, 'laundry/done', { laundryId: 'a', summary: '洗好了' }),
    ], true)
    const before = [...(chatSnapshot(assembler)?.nodes.values() ?? [])][0]
    expect(before?.key).toBeDefined()
    expect(before?.data).toEqual({ title: '一件衬衫', completed: 100, status: 'completed', summary: '洗好了' })

    // An older page: turn/step boundaries plus a second, still-running cycle.
    assembler.prepend([
      input(at(1, 'turn/start', { turn: 1 })),
      input(at(2, 'step/start', { turn: 1, step: 1 })),
      input(at(3, 'laundry/start', { laundryId: 'b', title: '牛仔裤' })),
      input(at(4, 'laundry/progress', { laundryId: 'b', completed: 40 })),
    ], false)
    assembler.flush()

    const nodes = [...(chatSnapshot(assembler)?.nodes.values() ?? [])]
    expect(nodes).toHaveLength(2)
    const nodeA = nodes.find(node => node.id === 'a')
    expect(nodeA?.key).toBe(before?.key) // keyed identity survives the prepend
    expect(nodeA?.data).toEqual(before?.data) // unchanged value is not replaced
    const nodeB = nodes.find(node => node.id === 'b')
    expect(nodeB?.data).toEqual({ title: '牛仔裤', completed: 40, status: 'running' })
  })

  it('publication: progress asks animation-frame, start/done immediate; one flush applies once', () => {
    const apply = vi.fn()
    const assembler = makeAssembler(laundryDefinition, testView(apply))
    assembler.replaceWindow(cycleA().slice(0, 3).map(input), false)
    assembler.flush()

    expect(assembler.append(input(at(4, 'laundry/progress', { laundryId: 'a', completed: 45 }))))
      .toBe('animation-frame')
    expect(assembler.append(input(at(5, 'laundry/progress', { laundryId: 'a', completed: 60 }))))
      .toBe('animation-frame')
    expect(assembler.append(input(at(6, 'laundry/done', { laundryId: 'a', summary: '洗好了' }))))
      .toBe('immediate')

    assembler.flush()
    expect(apply).toHaveBeenCalledTimes(1) // one frame, one publish

    const node = [...(chatSnapshot(assembler)?.nodes.values() ?? [])][0]
    expect(node?.data).toEqual({ title: '一件衬衫', completed: 100, status: 'completed', summary: '洗好了' })
  })

  it('match is an identity extractor — exactly once per event, no history access', () => {
    const matchSpy = vi.fn(laundryDefinition.match)
    const definition: ConversationNodeDefinition = { ...laundryDefinition, match: matchSpy }
    const assembler = makeAssembler(definition)
    assembler.replaceWindow(cycleA().map(input), false)
    expect(matchSpy).toHaveBeenCalledTimes(5)

    assembler.append(input(at(6, 'laundry/progress', { laundryId: 'a', completed: 99 })))
    expect(matchSpy).toHaveBeenCalledTimes(6)
  })

  it('two cycles in one window update independently', () => {
    const assembler = assemble([
      at(1, 'turn/start', { turn: 1 }),
      at(2, 'step/start', { turn: 1, step: 1 }),
      at(3, 'laundry/start', { laundryId: 'a', title: '一件衬衫' }),
      at(4, 'laundry/start', { laundryId: 'b', title: '牛仔裤' }),
      at(5, 'laundry/progress', { laundryId: 'a', completed: 45 }),
      at(6, 'laundry/progress', { laundryId: 'b', completed: 60 }),
      at(7, 'laundry/done', { laundryId: 'a', summary: '洗好了' }),
    ])
    const nodes = [...(chatSnapshot(assembler)?.nodes.values() ?? [])]

    expect(nodes).toHaveLength(2)
    expect(nodes.find(node => node.id === 'a')?.data).toEqual({
      title: '一件衬衫', completed: 100, status: 'completed', summary: '洗好了',
    })
    expect(nodes.find(node => node.id === 'b')?.data).toEqual({
      title: '牛仔裤', completed: 60, status: 'running',
    })
  })

  it('a Definition that never sees laundry/start rejects its start contract', () => {
    // The engine never calls start for a non-start match; the guard inside
    // start is a fail-loud tripwire for a mis-wired Definition.
    expect(() => laundryDefinition.start(
      { key: 'x', kind: 'laundry-job', id: 'a', matches: [], start: undefined, state: undefined, current: new Map() },
      { event: at(4, 'laundry/progress', { laundryId: 'a', completed: 45 }), role: 'update', location: { kind: 'unresolved' } },
      { previous: () => undefined },
    )).toThrow(/requires laundry\/start/)
  })
})
