import type { Context } from '@deepseek-ai/cordis'

export const name = 'warn'

export function apply(ctx: Context) {
  // 延后 1 秒，确保 logger-console 已经注册 ——
  // 条目是【并发】加载的（group.ts:71 的 Promise.allSettled），
  // 启动阶段的早期日志可能赶在 exporter 注册之前发出，直接丢失。
  setTimeout(() => {
    ctx.logger.error('error 级别')
    ctx.logger.info('info 级别')
    ctx.logger.warn('warn 级别')
    ctx.logger.debug('debug 级别')
  }, 1000)
}
