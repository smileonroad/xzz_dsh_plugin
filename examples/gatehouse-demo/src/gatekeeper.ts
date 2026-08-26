/**
 * Answerer on the real harness `approval/request` waterfall: the gatehouse
 * keeper. Config lists decide by tool name — `allow` answers
 * `'allowed-once'` (regular visitor, straight through), `deny` answers
 * `'rejected'` (banned, turned away at the door), anything else delegates
 * with `next()` (a stranger gets a phone call to the owner — the web UI
 * answerer, or a stub in tests).
 *
 * `prepend` decides where the automatic rule sits in the chain: `false`
 * pushes it behind already-registered answerers — the web UI answerer
 * (apiproxy, web-app bundle layer) claims every audited ask first, so a
 * `--patch`-mounted keeper stays dormant behind it; `true` unshifts it to
 * the front, the one position from which a patch overlay can actually
 * answer before the UI. The session-level `'never'` policy is decided by
 * the service BEFORE dispatch, so no prepend can override it: the keeper
 * is the door, the policy is the lock.
 * @module gatehouse-keeper
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-user-approval'

export interface Config {
  /** Tool names the keeper auto-approves ('allowed-once'). */
  allow: string[]
  /** Tool names the keeper refuses outright ('rejected'). */
  deny: string[]
  /** Register before already-registered answerers (see module doc). */
  prepend: boolean
}

export const Config: z<Config> = z.object({
  allow: z.array(z.string()).default([]),
  deny: z.array(z.string()).default([]),
  prepend: z.boolean().default(false),
})

export const name = 'gatehouse-keeper'
export const inject = ['approval']

export function apply(ctx: Context, config: Config) {
  const allow = new Set(config.allow)
  const deny = new Set(config.deny)
  ctx.on('approval/request', async (req, next): Promise<ApprovalOutcome> => {
    if (allow.has(req.toolName)) return 'allowed-once'
    if (deny.has(req.toolName)) return 'rejected'
    return next()
  }, { prepend: config.prepend })
}
