import type { Context } from '@deepseek-ai/cordis'

export const name = 'ids'

// 把每个 loader 条目的 id 打出来。
// 显式写了 id 的条目 → id 就是那个字符串，跨运行稳定；
// 没写 id 的条目   → loader 每次生成一个新的随机 id。
export function apply(ctx: Context) {
  setTimeout(() => {
    console.log('  ── loader 条目 ──')
    for (const entry of ctx.loader.entries()) {
      console.log(`     id=${String(entry.options.id).padEnd(10)} name=${entry.options.name}`)
    }
  }, 300)
}
