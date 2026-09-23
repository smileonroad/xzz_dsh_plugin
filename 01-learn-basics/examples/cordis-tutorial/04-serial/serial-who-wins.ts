import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'w/anyone-decides': (req: string) => string | undefined
    'w/nobody-decides': (req: string) => string | undefined
  }
}

export const name = 'serial-who-wins'

const approver = (ctx: Context, event: 'w/anyone-decides' | 'w/nobody-decides', who: string, verdict: string | undefined) => {
  ctx.on(event, () => {
    console.log(`     ${who}：${verdict === undefined ? '我不表态，转给下一位' : `我拍板：${verdict}`}`)
    return verdict
  })
}

export function apply(ctx: Context) {
  // 场景 A：第二位拍板
  approver(ctx, 'w/anyone-decides', '审批人甲', undefined)
  approver(ctx, 'w/anyone-decides', '审批人乙', 'REJECTED')
  approver(ctx, 'w/anyone-decides', '审批人丙', 'APPROVED')

  // 场景 B：全都不表态
  approver(ctx, 'w/nobody-decides', '审批人甲', undefined)
  approver(ctx, 'w/nobody-decides', '审批人乙', undefined)
  approver(ctx, 'w/nobody-decides', '审批人丙', undefined)

  void (async () => {
    console.log('场景 A：有人拍板 —— 第一个拍板的人说了算')
    console.log('   → ctx.serial 返回值:', await ctx.serial('w/anyone-decides', 'rm -rf /'))

    console.log('\n场景 B：全都不表态')
    console.log('   → ctx.serial 返回值:', await ctx.serial('w/nobody-decides', 'rm -rf /'))
  })()
}
