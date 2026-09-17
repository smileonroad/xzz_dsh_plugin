/**
 * 剧本的纯函数部分：把一次模型请求推导成本轮要说的内容，再翻成规范分片。
 *
 * 这一层不碰网络、不碰 Cordis，只依赖 `@deepseek-ai/dsh-llm` 的类型，
 * 所以可以单独测试，也可以被别的适配器复用（比如把回显换成真的 HTTP 调用）。
 *
 * 剧本指令（写在最后一条人类消息的开头）：
 *   `think:<内容>`              先说思考块再说文本块
 *   `tool:<名字> <JSON>`        要求调用工具（工具结果回来后回显结果）
 *   `fail:<CODE> <描述>`        适配器抛 LlmError（传输/协议故障路径）
 *   `provider-fail:<CODE> <描述>` 以 error finish 收流（提供方带内故障路径）
 *   `empty:`                   正常结束但无内容，适配器抛 EMPTY_RESPONSE
 *   `hang:`                    发半截文本后停住，等 abort
 *   其它                        回显 `[scripted] <原文>`
 * @module scripted-llm-adapter/script
 */

import type { ContentBlock, GenerateOptions, Message, StreamChunk } from '@deepseek-ai/dsh-llm'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ScriptedTurn } from './types.ts'

/** 回显前缀，一眼分辨这条回复来自剧本而不是真模型。 */
export const ECHO_PREFIX = '[scripted] '

/** 一条人类消息的开头命令。 */
const COMMAND = /^(think|tool|fail|provider-fail|empty|hang):\s*(.*)$/su

/** 拼接一组内容块里的可见文本，忽略图片、文件与工具块。 */
function textOf(blocks: readonly ContentBlock[]): string {
  return blocks.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
}

/**
 * 最后一条「人说的话」。
 *
 * 两个地方不能想当然。工具结果在规范词汇里也是 `user` 角色，所以按「有没有文本块」
 * 判断；而 harness 还会往历史里插自己生成的 user 消息（比如工作区指令、技能目录，
 * 来源标记是 `agent-instructions` / `plugin`），所以优先取来源为 `user` 的那条。
 * @param options - 本次模型请求。
 * @returns 人类消息的纯文本；没有则返回空串。
 */
export function lastUserText(options: GenerateOptions): string {
  let fallback = ''
  for (let index = options.messages.length - 1; index >= 0; index -= 1) {
    const message = options.messages[index] as Message
    if (message.role !== 'user') continue
    const text = textOf(message.content)
    if (text.length === 0) continue
    if (message.source.kind === 'user') return text
    if (fallback.length === 0) fallback = text
  }
  return fallback
}

/**
 * 最后一条消息若是工具结果，取出其中的文本内容。
 *
 * 这一条是「两轮对话」的判据：历史末尾出现工具结果，说明上一轮的调用已经跑完，
 * 本轮该收尾，而不是再调一次工具。
 * @param options - 本次模型请求。
 * @returns 工具结果的文本，或 `undefined`。
 */
export function toolResultText(options: GenerateOptions): string | undefined {
  const last = options.messages.at(-1)
  if (last === undefined || last.role !== 'user') return undefined
  for (const block of last.content) {
    if (block.type === 'tool-result') return textOf(block.content)
  }
  return undefined
}

/** 把 `CODE 描述` 拆开，缺描述时给一句兜底。 */
function codeAndMessage(rest: string): { code: string; message: string } {
  const trimmed = rest.trim()
  const split = trimmed.search(/\s/u)
  if (split === -1) return { code: trimmed.length > 0 ? trimmed : 'SCRIPTED_FAILURE', message: 'the scripted provider failed' }
  return { code: trimmed.slice(0, split), message: trimmed.slice(split).trim() }
}

/**
 * 推导本轮剧本。
 * @param options - 本次模型请求，适配器原样收到的那份。
 * @returns 本轮要说的话。
 */
export function planTurn(options: GenerateOptions): ScriptedTurn {
  const completed = toolResultText(options)
  if (completed !== undefined) return { kind: 'text', text: `${ECHO_PREFIX}tool returned ${completed}` }

  const prompt = lastUserText(options).trim()
  const match = COMMAND.exec(prompt)
  if (match === null) return { kind: 'text', text: `${ECHO_PREFIX}${prompt}` }

  const command = match[1] ?? ''
  const rest = match[2] ?? ''
  switch (command) {
    case 'think':
      return { kind: 'text', reasoning: rest.trim(), text: `${ECHO_PREFIX}${rest.trim()}` }
    case 'tool': {
      const trimmed = rest.trim()
      const split = trimmed.search(/\s/u)
      if (split === -1) return { kind: 'tool-call', name: trimmed, arguments: '{}' }
      return {
        kind: 'tool-call',
        name: trimmed.slice(0, split),
        arguments: trimmed.slice(split).trim().length > 0 ? trimmed.slice(split).trim() : '{}',
      }
    }
    case 'fail':
      return { kind: 'failure', ...codeAndMessage(rest) }
    case 'provider-fail':
      return { kind: 'provider-error', ...codeAndMessage(rest) }
    case 'empty':
      return { kind: 'empty' }
    case 'hang':
      return { kind: 'hang' }
    default:
      return { kind: 'text', text: `${ECHO_PREFIX}${prompt}` }
  }
}

/**
 * 把一轮「正常」剧本翻成规范分片。
 *
 * 顺序遵守协议义务：块先 `block-start` 再若干 delta，`block-end` 交出拼好的块；
 * 用量在 `finish` 之前；`finish` 之后不再发任何东西。`failure` 与 `hang`
 * 不是分片序列，由适配器单独处理。
 * @param turn - 本轮剧本（只接受正常形态）。
 * @param options - 本次请求，用于推算用量与工具调用 id。
 * @returns 本轮的分片序列。
 */
export function renderTurn(
  turn: Extract<ScriptedTurn, { kind: 'text' | 'tool-call' | 'provider-error' }>,
  options: GenerateOptions,
): StreamChunk[] {
  const chunks: StreamChunk[] = []
  // 输入用量按「模型看到了几条消息」算，输出用量按实际字符数算。规则简单且确定。
  const inputTokens = options.messages.length
  let outputTokens = 0
  let index = 0

  if (turn.kind === 'provider-error') {
    chunks.push({ type: 'finish', reason: { kind: 'error', failure: { code: turn.code, message: turn.message } } })
    return chunks
  }

  if (turn.kind === 'text' && turn.reasoning !== undefined && turn.reasoning.length > 0) {
    chunks.push(
      { type: 'block-start', index, blockType: 'reasoning' },
      { type: 'reasoning-delta', index, text: turn.reasoning },
      { type: 'block-end', index, block: { type: 'reasoning', text: turn.reasoning } },
    )
    outputTokens += turn.reasoning.length
    index += 1
  }

  if (turn.kind === 'tool-call' && turn.text !== undefined && turn.text.length > 0) {
    chunks.push(
      { type: 'block-start', index, blockType: 'text' },
      { type: 'text-delta', index, text: turn.text },
      { type: 'block-end', index, block: { type: 'text', text: turn.text } },
    )
    outputTokens += turn.text.length
    index += 1
  }

  if (turn.kind === 'text') {
    chunks.push(
      { type: 'block-start', index, blockType: 'text' },
      { type: 'text-delta', index, text: turn.text },
      { type: 'block-end', index, block: { type: 'text', text: turn.text } },
    )
    outputTokens += turn.text.length
    chunks.push(
      { type: 'usage', usage: { inputTokens, outputTokens } },
      { type: 'finish', reason: { kind: 'stop' } },
    )
    return chunks
  }

  // 工具调用的参数全程是原始 JSON 字符串，这里刻意拆成两段 delta，
  // 让「增量拼接」这件事在测试里看得见。
  const id = ToolCallId(`scripted-${turn.name}-${String(options.messages.length)}`)
  const split = Math.max(1, Math.floor(turn.arguments.length / 2))
  chunks.push(
    { type: 'block-start', index, blockType: 'tool-call' },
    { type: 'tool-call-delta', index, id, name: turn.name, argumentsDelta: turn.arguments.slice(0, split) },
    { type: 'tool-call-delta', index, id, argumentsDelta: turn.arguments.slice(split) },
    { type: 'block-end', index, block: { type: 'tool-call', id, name: turn.name, arguments: turn.arguments } },
    { type: 'usage', usage: { inputTokens, outputTokens: outputTokens + turn.arguments.length } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  )
  return chunks
}
