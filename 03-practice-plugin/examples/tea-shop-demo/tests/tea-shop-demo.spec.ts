import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as teaShop from '../src/tea-shop.ts'
import { TeaShopError } from '../src/tea-shop.ts'
import * as orderWatch from '../src/order-watch.ts'
import * as shopPolicy from '../src/shop-policy.ts'

/** Mount the producer service on a fresh context. */
async function harness(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(teaShop)
  return ctx
}

describe('tea-shop-demo: self-declared event family', () => {
  it('placeOrder emits order/start then order/ready, paired by orderId', async () => {
    const ctx = await harness()
    const events: Array<{ kind: 'start' | 'ready'; order: { orderId: string; drink: string } }> = []
    ctx.on('order/start', order => {
      events.push({ kind: 'start', order })
    })
    ctx.on('order/ready', order => {
      events.push({ kind: 'ready', order })
    })
    const order = await ctx.teaShop.placeOrder('波霸奶茶')
    expect(events).toHaveLength(2)
    expect(events[0]?.kind).toBe('start')
    expect(events[1]?.kind).toBe('ready')
    expect(events[0]?.order.orderId).toBe(order.orderId)
    expect(events[1]?.order.orderId).toBe(order.orderId)
    expect(events[0]?.order.drink).toBe('波霸奶茶')
  })

  it('every order gets a distinct identity snapshot', async () => {
    const ctx = await harness()
    const first = await ctx.teaShop.placeOrder('a')
    const second = await ctx.teaShop.placeOrder('b')
    expect(first.orderId).not.toBe(second.orderId)
    expect(first.drink).toBe('a')
    expect(second.drink).toBe('b')
  })

  it('the shop-policy veto refuses the order when closed', async () => {
    const ctx = await harness()
    await ctx.plugin(shopPolicy, { closed: true })
    let started = 0
    ctx.on('order/start', () => {
      started += 1
    })
    await expect(ctx.teaShop.placeOrder('冰美式')).rejects.toBeInstanceOf(TeaShopError)
    await expect(ctx.teaShop.placeOrder('冰美式')).rejects.toMatchObject({ code: 'refused' })
    expect(started).toBe(0) // the family never started
  })

  it('the shop-policy delegates when open', async () => {
    const ctx = await harness()
    await ctx.plugin(shopPolicy, { closed: false })
    const order = await ctx.teaShop.placeOrder('乌龙玛奇朵')
    expect(order.drink).toBe('乌龙玛奇朵')
  })

  it('the waterfall default accepts when no listener answers', async () => {
    const ctx = await harness()
    const order = await ctx.teaShop.placeOrder('珍珠奶茶')
    expect(order.drink).toBe('珍珠奶茶')
  })

  it('serial barista/pick: the first registered barista wins', async () => {
    const ctx = await harness()
    const picked: string[] = []
    ctx.on('barista/pick', orderId => {
      picked.push(`barista-1:${orderId}`)
      return 'barista-1'
    })
    ctx.on('barista/pick', orderId => {
      picked.push(`barista-2:${orderId}`)
      return 'barista-2'
    })
    await ctx.teaShop.placeOrder('波霸')
    expect(picked).toHaveLength(1)
    expect(picked[0]).toContain('barista-1')
  })

  it('serial with no listener still lets the order through', async () => {
    const ctx = await harness()
    const order = await ctx.teaShop.placeOrder('四季春')
    expect(order.drink).toBe('四季春')
  })

  it('bail shop/open fails closed and takes the first answer', async () => {
    const ctx = await harness()
    expect(ctx.teaShop.isOpen()).toBe(false) // nobody answers = closed
    ctx.on('shop/open', () => true)
    ctx.on('shop/open', () => false)
    expect(ctx.teaShop.isOpen()).toBe(true) // the first answer wins
  })

  it('parallel notify/patrons notifies everyone and awaits them all', async () => {
    const ctx = await harness()
    let finished = 0
    ctx.on('notify/patrons', async () => {
      await new Promise(resolve => setTimeout(resolve, 5))
      finished += 1
    })
    ctx.on('notify/patrons', async () => {
      await new Promise(resolve => setTimeout(resolve, 5))
      finished += 1
    })
    await ctx.teaShop.announce('order-1')
    expect(finished).toBe(2) // both settled before announce returned
  })

  it('order-watch derives orders/served from order/ready', async () => {
    const ctx = await harness()
    await ctx.plugin(orderWatch)
    const served: Array<{ orderId: string }> = []
    ctx.on('orders/served', order => {
      served.push(order)
    })
    const order = await ctx.teaShop.placeOrder('椰椰乌龙')
    expect(served).toHaveLength(1)
    expect(served[0]?.orderId).toBe(order.orderId)
  })

  it('ctx.on returns a disposer that removes the listener', async () => {
    const ctx = await harness()
    let starts = 0
    const stop = ctx.on('order/start', () => {
      starts += 1
    })
    await ctx.teaShop.placeOrder('a')
    expect(starts).toBe(1)
    stop()
    await ctx.teaShop.placeOrder('b')
    expect(starts).toBe(1)
  })

  it('registers the producer and consumers with Loader-safe exports', () => {
    expect(teaShop.name).toBe('tea-shop-demo')
    expect(orderWatch.name).toBe('tea-shop-order-watch')
    expect(orderWatch.inject).toEqual(['teaShop'])
    expect(shopPolicy.name).toBe('tea-shop-shop-policy')
    expect(shopPolicy.inject).toEqual(['teaShop'])
    expect(shopPolicy.Config).toBeDefined()
    expect('default' in teaShop).toBe(false)
    expect('default' in orderWatch).toBe(false)
    expect('default' in shopPolicy).toBe(false)
  })
})
