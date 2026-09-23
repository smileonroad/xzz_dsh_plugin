/**
 * The laundromat's Host half: one `laundry_start` tool that records a durable
 * wash cycle into the agent's session log (`laundry/start` → steps ×
 * `laundry/progress` → `laundry/done`, one stable `laundryId` throughout).
 * The Client half (src/client/) folds that event family into a chat card; the
 * two halves never meet directly — only through the session log.
 *
 * The cycle runs on a real timer chain (defaults: 4 ticks × 800 ms), is
 * cancellable, and is cancelled when the plugin unloads.
 * @module laundry-machine
 */

import { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
// Type-only side-effect import: pulls the SessionEventMap merge into the
// program so `agent.session.append('laundry/start', …)` is typed against the
// producer contract without any runtime import.
import type {} from './events.ts'

export const name = 'laundry-machine'
export const inject = ['tools']

const DEFAULT_TITLE = '日常衣物'
const DEFAULT_STEPS = 4
const DEFAULT_INTERVAL_MS = 800

interface LaundryStartArgs {
  readonly item?: string
  readonly steps?: number
  readonly interval_ms?: number
}

/** Stable success value returned to the model. */
interface LaundryStartResult {
  readonly laundryId: string
  readonly title: string
  readonly status: 'running'
}

/** One human-readable validation failure, or undefined when the args are valid. */
function validateArgs(args: LaundryStartArgs): string | undefined {
  if (args.item !== undefined && (typeof args.item !== 'string' || args.item.trim().length === 0)) {
    return 'laundry_start item must be a non-empty string when provided.'
  }
  if (args.steps !== undefined && (!Number.isSafeInteger(args.steps) || args.steps < 1 || args.steps > 100)) {
    return 'laundry_start steps must be a positive safe integer between 1 and 100.'
  }
  if (args.interval_ms !== undefined && (!Number.isSafeInteger(args.interval_ms) || args.interval_ms < 1)) {
    return 'laundry_start interval_ms must be a positive safe integer.'
  }
  return undefined
}

export function apply(ctx: Context): void {
  // laundryId → live timeout chain of one cycle, so unload can cancel them.
  const cycles = new Map<string, ReturnType<typeof setTimeout>[]>()
  let nextId = 1
  const allocateId = (): string => `laundry-${nextId++}`

  ctx.tools.register(defineTool({
    name: 'laundry_start',
    description: 'Start one laundry cycle in the laundromat. Records a durable wash '
      + 'cycle (laundry/start, then laundry/progress ticks, then laundry/done) into the '
      + 'session log; a chat card shows the drum progress. Provide item (what is being '
      + 'washed), and optionally steps (progress ticks, default 4) and interval_ms '
      + '(delay between ticks, default 800).',
    parameters: {
      item: { type: 'string', description: 'What is being washed, e.g. "a shirt".' },
      steps: { type: 'number', description: 'Number of progress ticks (default 4).' },
      interval_ms: { type: 'number', description: 'Milliseconds between ticks (default 800).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          laundryId: { type: 'string', required: true },
          title: { type: 'string', required: true },
          status: { type: 'string', required: true, const: 'running' },
        },
      },
      render: (_args, value): ContentBlock[] => {
        const result = value as unknown as LaundryStartResult
        return [{ type: 'text', text: `洗衣开始：${result.title}（${result.laundryId}）` }]
      },
    },
    execute: async (args, exec): Promise<LaundryStartResult> => {
      const agent = exec.agent
      if (agent === undefined) {
        throw new Error('laundry_start needs a live agent session to record the cycle.')
      }
      const invalid = validateArgs(args)
      if (invalid !== undefined) throw new Error(invalid)

      const title = args.item === undefined ? DEFAULT_TITLE : args.item.trim()
      const steps = args.steps ?? DEFAULT_STEPS
      const intervalMs = args.interval_ms ?? DEFAULT_INTERVAL_MS
      const laundryId = allocateId()

      agent.session.append('laundry/start', { laundryId, title })

      const timeouts: ReturnType<typeof setTimeout>[] = []
      for (let i = 1; i <= steps; i++) {
        // Last tick stops at 99; the done event finalizes 100 in the Definition.
        const completed = Math.min(99, Math.floor(i * 100 / steps))
        timeouts.push(setTimeout(() => {
          agent.session.append('laundry/progress', { laundryId, completed })
        }, i * intervalMs))
      }
      timeouts.push(setTimeout(() => {
        agent.session.append('laundry/done', {
          laundryId,
          summary: `${title} 洗好了，香喷喷的`,
        })
        cycles.delete(laundryId)
      }, (steps + 1) * intervalMs))
      cycles.set(laundryId, timeouts)

      return { laundryId, title, status: 'running' }
    },
  }))

  ctx.effect(() => () => {
    for (const chain of cycles.values()) {
      for (const timer of chain) clearTimeout(timer)
    }
    cycles.clear()
  }, 'laundry-machine: cancel running cycles')
}
