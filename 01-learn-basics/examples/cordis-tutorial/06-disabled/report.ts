// 补全件：按正文描述 + 同模块/相邻实验源码推得，非文档原文。
import { FiberState, type Context } from '@deepseek-ai/cordis'

export const name = 'report'

// 在 1 秒和 13 秒各打印一次所有 fiber 的状态。
export function apply(ctx: Context) {
  const dump = (tag: string) => {
    const parts: string[] = []
    for (const runtime of ctx.registry.values()) {
      for (const fiber of runtime.fibers) {
        parts.push(`${fiber.name}=${FiberState[fiber.state]}`)
      }
    }
    console.log(`   [${tag}] ${parts.join('  ')}`)
  }
  setTimeout(() => dump('1 秒后'), 1000)
  setTimeout(() => dump('13 秒后'), 13000)
}
