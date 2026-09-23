/**
 * Event Producer of the self-declared typed-events seam: a milk-tea shop
 * service that declares and emits its own event family. Every event is
 * annotated with its distribution mode (`@mode`), which is part of the
 * contract — the dispatcher must call the matching ctx method
 * (`ctx.emit` / `ctx.serial` / `ctx.bail` / `ctx.parallel` / `ctx.waterfall`),
 * and listeners follow the mode. The family discipline mirrors the harness's
 * own event pairs (`command/run` ↔ `command/done`, `workflow/start` ↔
 * `workflow/agent-end`): stable identity, paired start/end, identity snapshot
 * in every payload.
 * @module tea-shop-demo
 */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    teaShop: TeaShopService
  }

  interface Events {
    /** An order was accepted (family start, paired with `order/ready` by orderId). @mode emit */
    'order/start'(order: OrderInfo): void
    /** The order is served (family end, paired with `order/start` by orderId). @mode emit */
    'order/ready'(order: OrderInfo): void
    /** The first registered barista wins the order. @mode serial */
    'barista/pick'(orderId: string): string | undefined | Promise<string | undefined>
    /** Sync open check; the first answer wins, none answers = closed. @mode bail */
    'shop/open'(): boolean | undefined
    /** Fan-out notification to every waiting patron. @mode parallel */
    'notify/patrons'(orderId: string): void | Promise<void>
    /** Shop-rule interception: return a decision or call `next()`. @mode waterfall */
    'order/request'(order: OrderRequest, next: () => Promise<OrderDecision>): Promise<OrderDecision>
  }
}

/** Identity snapshot carried by every order-family event. */
export interface OrderInfo {
  orderId: string
  drink: string
}

/** What the `order/request` waterfall asks for. */
export interface OrderRequest {
  orderId: string
  drink: string
}

/** The decision the shop-rule waterfall produces. */
export type OrderDecision =
  | { kind: 'accept' }
  | { kind: 'refuse'; reason: string }

/** Structured domain error thrown by the shop layer. */
export class TeaShopError extends Error {
  constructor(message: string, readonly code: 'refused') {
    super(message)
  }
}

/**
 * The milk-tea shop. Every method dispatches one of the declared events:
 * `placeOrder` runs the shop-rule waterfall, announces `order/start`, picks a
 * barista via `serial`, and serves with `order/ready`; `announce` fans out
 * `notify/patrons`; `isOpen` bails on `shop/open`.
 */
export class TeaShopService extends Service {
  private readonly orders = new Map<string, OrderInfo>()

  constructor(ctx: Context) {
    super(ctx, 'teaShop')
  }

  /** Place one order; throws {@link TeaShopError} when the shop rule refuses. */
  async placeOrder(drink: string): Promise<OrderInfo> {
    const orderId = randomUUID()
    const decision = await this.ctx.waterfall(
      'order/request',
      { orderId, drink },
      async () => ({ kind: 'accept' as const }),
    )
    if (decision.kind === 'refuse') {
      throw new TeaShopError(`order refused: ${decision.reason}`, 'refused')
    }
    const order: OrderInfo = { orderId, drink }
    this.orders.set(orderId, order)
    this.ctx.emit('order/start', order)
    await this.ctx.serial('barista/pick', orderId)
    this.ctx.emit('order/ready', order)
    return order
  }

  /** Announce a served order to everyone waiting. */
  async announce(orderId: string): Promise<void> {
    await this.ctx.parallel('notify/patrons', orderId)
  }

  /** Sync open check; fails closed when nobody answers. */
  isOpen(): boolean {
    return this.ctx.bail('shop/open') ?? false
  }
}

export const name = 'tea-shop-demo'

export async function apply(ctx: Context) {
  // Nested plugin MUST be awaited: an unawaited fiber swallows registration
  // errors (the same rule as units-capability and events-demo).
  await ctx.plugin(TeaShopService)
}
