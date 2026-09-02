/**
 * The laundromat's Client half: one Conversation Node Definition that folds
 * the durable `laundry/*` session event family into a single keyed chat card.
 *
 * The Definition is a pure function of the session log: `match` extracts a
 * stable identity from each event (never scans history), `start`/`update`
 * build immutable State, and `buildViewNode` projects that State into the
 * renderer's `data`. The renderer (view.tsx) consumes only that data.
 * @module laundry-node
 */

import type {
  ChatConversationViewNode,
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only side-effect import: pulls the producer's SessionEventMap merge
// (../events.ts) into this compilation so `event.type === 'laundry/start'`
// narrows `event.data` to the typed payload. In a real package split the
// producer exports this merge purely and the client imports it the same way.
import type {} from '../events.ts'

/** Final keyed Chat payload for one laundry cycle. */
export interface LaundryChatData {
  readonly title: string
  /** Drum percentage: 0–99 while running, 100 once done. */
  readonly completed: number
  readonly status: 'running' | 'completed'
  readonly summary?: string
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    /** One durable laundry cycle rendered as a chat card. */
    'laundry-job': LaundryChatData
  }
}

interface LaundryState extends LaundryChatData {}

export const laundryDefinition: ConversationNodeDefinition<LaundryState> = {
  kind: 'laundry-job',
  target: 'chat',
  match: (event) => {
    if (event.type === 'laundry/start') return { id: event.data.laundryId, role: 'start' }
    if (event.type === 'laundry/progress' || event.type === 'laundry/done') {
      return { id: event.data.laundryId, role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'laundry/start') throw new Error('laundry-job requires laundry/start')
    return {
      title: match.event.data.title,
      completed: 0,
      status: 'running',
    }
  },
  update: (context, match) => {
    if (match.event.type === 'laundry/progress') {
      return { ...context.state, completed: match.event.data.completed }
    }
    if (match.event.type === 'laundry/done') {
      return {
        ...context.state,
        completed: 100,
        status: 'completed',
        summary: match.event.data.summary,
      }
    }
    return context.state
  },
  // High-frequency visible deltas merge per animation frame; structural and
  // terminal changes publish immediately.
  publication: (match) => match.event.type === 'laundry/progress' ? 'animation-frame' : 'immediate',
  buildViewNode: (context): ChatConversationViewNode | null => {
    if (context.start === undefined || context.state === undefined) return null
    const state = context.state
    return {
      key: context.key,
      kind: 'laundry-job',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start.event.seq,
      location: context.start.location,
      visibility: 'visible',
      data: {
        title: state.title,
        completed: state.completed,
        status: state.status,
        ...state.summary === undefined ? {} : { summary: state.summary },
      },
    }
  },
}
