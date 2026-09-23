import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'e/zero': (x: number) => unknown
    'e/empty': (x: number) => unknown
    'e/null': (x: number) => unknown
    'e/false': (x: number) => unknown
  }
}

export const name = 'bail-edge'

export function apply(ctx: Context) {
  const pair = (event: 'e/zero' | 'e/empty' | 'e/null' | 'e/false', value: unknown, label: string) => {
    ctx.on(event, () => value)
    ctx.on(event, () => { console.log(`     ⚠️  第二个监听器执行了 —— 说明 ${label} 没有短路`); return 'second' })
  }

  pair('e/zero', 0, '0')
  pair('e/empty', '', "''")
  pair('e/null', null, 'null')
  pair('e/false', false, 'false')

  console.log('判据：isBailed(v) = v !== null && v !== false && v !== undefined\n')

  console.log("① 首个监听器返回 0         → ctx.bail 返回:", ctx.bail('e/zero', 1))
  console.log("② 首个监听器返回 ''        → ctx.bail 返回:", JSON.stringify(ctx.bail('e/empty', 1)))
  console.log("③ 首个监听器返回 null      → ctx.bail 返回:", ctx.bail('e/null', 1))
  console.log("④ 首个监听器返回 false     → ctx.bail 返回:", ctx.bail('e/false', 1))
}
