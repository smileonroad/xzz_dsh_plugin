/**
 * 拦截图层：在模型调用之前挡掉含敏感词的输入。
 *
 * 挂的是 `llm/stream` 瀑布，也就是模型调用的唯一入口。命中词表时直接返回一段
 * 规范分片当作模型的回答，适配器一次都不会被调用；没命中就把接力棒交给
 * `next()`，正常走模型。
 *
 * 之所以不把这个判断写进适配器：策略不该长在提供方身上。换个真模型，
 * 适配器就换了，而这段门禁与用哪个模型无关。
 * @module scripted-llm-adapter/guard
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { lastUserText } from './script.ts'

/** 插件名（全局命名空间，别和别的插件重名）。 */
export const name = 'prompt-guard'

/** 要读 `llm/stream` 事件，就得等 LLM 运行时先就绪。 */
export const inject = ['llm']

/** 门禁配置；默认值挂在下面的 schema 字段上。 */
export interface Config {
  /** 命中任意一个词就拦下，用的是子串匹配。 */
  words: string[]
  /** 拦下之后当作模型回答返回的文本。 */
  refusal: string
}

export const Config: Schema<Config> = Schema.object({
  words: Schema.array(Schema.string()).default(['权限', '密码', '密钥', 'token']),
  refusal: Schema.string().default('非法内容，请重新输入。'),
})

/**
 * 找出第一个命中的词。纯函数，方便单独测试。
 * @param text - 待检查的文本，通常是最后一条人类消息。
 * @param words - 词表，子串匹配。
 * @returns 命中的词，或 `undefined`。
 */
export function matchBlockedWord(text: string, words: readonly string[]): string | undefined {
  return words.find(word => word.length > 0 && text.includes(word))
}

/**
 * 用一段规范分片「替模型」发言。
 *
 * 注意它和适配器的产出遵守同一套契约：块启停配对、`finish` 收尾。
 * 没有发生模型调用，所以不报 `usage`。
 * @param text - 要显示给用户的文本。
 * @returns 一段合法的分片流。
 */
export async function* refusalStream(text: string): AsyncIterable<StreamChunk> {
  yield { type: 'block-start', index: 0, blockType: 'text' }
  yield { type: 'text-delta', index: 0, text }
  yield { type: 'block-end', index: 0, block: { type: 'text', text } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

/**
 * 挂载拦截层。
 * @param ctx - 插件上下文，`ctx.llm` 已就绪。
 * @param config - 已校验的配置。
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on('llm/stream', (options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) => {
    // 压缩、起标题这类后台辅助调用不设门禁，否则会打断它们。
    if (options.purpose !== undefined) return next()
    const hit = matchBlockedWord(lastUserText(options), config.words)
    if (hit === undefined) return next()
    return refusalStream(`${config.refusal}（命中：${hit}）`)
  })
}
