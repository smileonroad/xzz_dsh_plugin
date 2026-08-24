/**
 * Event Consumer of the self-declared typed-events seam: the shop-rule
 * decider for the `order/request` waterfall. When the shop is closed
 * (config), it refuses without calling `next()` — a veto that short-circuits
 * the rest of the chain, and `placeOrder` throws. When open, it delegates.
 * The decider role mirrors events-demo's `tool-policy`.
 * @module tea-shop-shop-policy
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from './tea-shop.ts'
import type { OrderDecision } from './tea-shop.ts'

export interface Config {
  /** When true, every incoming order is refused. */
  closed: boolean
}

export const Config: z<Config> = z.object({
  closed: z.boolean().default(false),
})

export const name = 'tea-shop-shop-policy'
export const inject = ['teaShop']

export function apply(ctx: Context, config: Config) {
  ctx.on('order/request', async (_request, next): Promise<OrderDecision> => {
    if (config.closed) {
      return { kind: 'refuse', reason: 'the shop is closed' }
    }
    return next()
  })
}
