/**
 * Waterfall decider on the real harness `tools/pre-execute` event: denies
 * tools on a block list before dispatch. A decider owns the decision — it
 * may return a decision without calling `next()`, which short-circuits the
 * rest of the chain and the tool never runs.
 * @module events-demo-tool-policy
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

/** Tool names this policy denies before dispatch. */
const DENIED_TOOLS = new Set(['dangerous_tool'])

export const name = 'events-demo-tool-policy'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (DENIED_TOOLS.has(exec.name)) {
      return { kind: 'deny', reason: `tool "${exec.name}" is denied by the demo policy` }
    }
    return next()
  })
}
