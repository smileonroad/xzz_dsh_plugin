/**
 * Waterfall observer on the real harness `tools/pre-execute` and
 * `tools/post-execute` events. An observer only records and MUST delegate
 * via `next()`: returning without calling `next()` short-circuits the rest
 * of the chain — a forgot-next observer silently bypasses every downstream
 * decider (see the discipline tests in events-demo.spec.ts).
 * @module events-demo-tool-observer
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'events-demo-tool-observer'
export const inject = ['tools']

export function apply(ctx: Context) {
  // Record-only observation before dispatch; always delegate.
  ctx.on('tools/pre-execute', async (_exec, next) => {
    return next()
  })

  // Record-only observation after dispatch; always delegate.
  ctx.on('tools/post-execute', async (_exec, _result, next) => {
    return next()
  })
}
