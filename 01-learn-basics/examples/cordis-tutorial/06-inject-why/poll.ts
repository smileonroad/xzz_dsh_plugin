import type { Context } from '@deepseek-ai/cordis'

export const name = 'poll'

export function apply(ctx: Context) {
  const read = (tag: string) => {
    const v = ctx.get('greeter')
    console.log(`   [ctx.get 无 inject] ${tag} → ${typeof v}`)
  }
  read('t=0  ')
  setTimeout(() => read('t=300'), 300)
  setTimeout(() => read('t=500'), 500)
  setTimeout(() => read('t=700'), 700)
}
