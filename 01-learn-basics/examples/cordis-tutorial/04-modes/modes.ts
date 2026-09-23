import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'm/emit'(x: number): string
    'm/parallel'(x: number): string
    'm/serial': (x: number) => string | undefined
    'm/bail': (x: number) => string | undefined
  }
}

export const name = 'modes-demo'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function apply(ctx: Context) {
  // ── emit：同步广播，不等待、不收集 ──
  ctx.on('m/emit', () => { console.log('     [emit] A 执行'); return 'A' })
  ctx.on('m/emit', () => { console.log('     [emit] B 执行'); return 'B' })

  // ── parallel：并发，一起等待 ──
  ctx.on('m/parallel', async () => { await wait(60); console.log('     [parallel] A 结束（慢）'); return 'A' })
  ctx.on('m/parallel', async () => { await wait(10); console.log('     [parallel] B 结束（快）'); return 'B' })

  // ── serial：顺序执行，首个非 undefined 胜出并停止 ──
  ctx.on('m/serial', () => { console.log('     [serial] A 执行'); return undefined })
  ctx.on('m/serial', () => { console.log('     [serial] B 执行 → 胜出'); return 'B' })
  ctx.on('m/serial', () => { console.log('     [serial] C 执行（不该出现！）'); return 'C' })

  // ── bail：serial 的同步版 ──
  ctx.on('m/bail', () => { console.log('     [bail] A 执行'); return undefined })
  ctx.on('m/bail', () => { console.log('     [bail] B 执行 → 胜出'); return 'B' })
  ctx.on('m/bail', () => { console.log('     [bail] C 执行（不该出现！）'); return 'C' })

  void (async () => {
    console.log('① emit —— 不等待、不收集返回值')
    console.log('   → 返回值:', ctx.emit('m/emit', 1))
    await wait(100)

    console.log('\n② parallel —— 所有监听器并发，一起 await')
    console.log('   → 返回值:', await ctx.parallel('m/parallel', 1))

    console.log('\n③ serial —— 顺序执行，首个非 undefined 胜出')
    console.log('   → 返回值:', await ctx.serial('m/serial', 1))

    console.log('\n④ bail —— serial 的同步版')
    console.log('   → 返回值:', ctx.bail('m/bail', 1))

    process.exit(0)
  })()
}
