/**
 * Event Consumer of the self-declared typed-events seam: listens to the
 * tea-shop's order family and derives its own `orders/served` event when an
 * order is ready. The single type-only import pulls the producer's
 * `interface Events` merge into this plugin's compilation (no runtime
 * import), so `ctx.on('order/ready', ...)` is fully typed across plugins.
 * @module tea-shop-order-watch
 */

import type { Context } from '@deepseek-ai/cordis'
import type { OrderInfo } from './tea-shop.ts'

declare module '@deepseek-ai/cordis' {
  interface Events {
    /** Derived by this plugin from `order/ready`. @mode emit */
    'orders/served'(order: OrderInfo): void
  }
}

export const name = 'tea-shop-order-watch'
export const inject = ['teaShop']

export function apply(ctx: Context) {
  // Record-only observation of the family start.
  ctx.on('order/start', (_order) => {
    // nothing to derive yet
  })

  // Derive our own event from the family end.
  ctx.on('order/ready', (order) => {
    ctx.emit('orders/served', order)
  })
}
