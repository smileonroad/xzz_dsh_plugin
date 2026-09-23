import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'p/all': (x: number) => Promise<void>
    'p/fireforget': (x: number) => void
  }
}

export const name = 'parallel-waits'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const t0 = Date.now()
const stamp = () => `+${String(Date.now() - t0).padStart(3, ' ')}ms`

export function apply(ctx: Context) {
  // ── 实验 1：最快的那个抛错，parallel 还会等慢的吗？ ──
  ctx.on('p/all', async () => { await wait(60); console.log(`   ${stamp()}  A 完成（慢，60ms）`) })
  ctx.on('p/all', async () => { await wait(10); console.log(`   ${stamp()}  B 抛错（快，10ms）`); throw new Error('B 炸了') })
  ctx.on('p/all', async () => { await wait(30); console.log(`   ${stamp()}  C 完成（中，30ms）`) })

  // ── 实验 2：监听器内部 fire-and-forget 的任务，parallel 会等吗？ ──
  ctx.on('p/fireforget', () => {
    void (async () => {
      await wait(80)
      console.log(`   ${stamp()}  内部异步任务完成（此时 parallel 早就返回了）`)
    })()
  })

  void (async () => {
    console.log('① B 最快抛错 —— parallel 还会等 A(60ms) 和 C(30ms) 吗？')
    console.log(`   ${stamp()}  调用 parallel`)
    try {
      await ctx.parallel('p/all', 1)
      console.log(`   ${stamp()}  parallel 正常返回`)
    } catch (error) {
      console.log(`   ${stamp()}  parallel 抛出: ${(error as Error).constructor.name}`)
    }

    console.log('\n② 监听器内部 fire-and-forget —— parallel 会等那个内部任务吗？')
    console.log(`   ${stamp()}  调用 parallel`)
    await ctx.parallel('p/fireforget', 1)
    console.log(`   ${stamp()}  parallel 返回 ← 此刻内部任务还没做完`)

    await wait(120)
    console.log(`\n   ${stamp()}  全部结束`)
    process.exit(0)
  })()
}
