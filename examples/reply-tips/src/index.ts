/**
 * reply-tips — 推荐提示
 *
 * 运行体是「动态 Cordis 插件」的双端（code.host + code.client 自包含纯 JS），本文件把
 * 它内部**纯函数核心**提成类型化 TS：Host 侧的回扫取数 / 规则兜底 / 模型输出解析 /
 * 提示词构建，以及开关文件的读写。宿主耦合的部分（React 组件、slots 注册、ctx.get
 * 服务、harness.handle RPC、llm.stream 调用循环）留在运行体内，不在这里静态表达；
 * 双端 apply 的结构与数据流见 README「源码设计（运行体结构）」一节。
 *
 * 与运行体的对应：运行体里 latestTurnPair / fallbackTips / parseModelOutput /
 * buildSuggestionsPrompt / readToggleFile / withToggle 的行为与本文件导出一致，
 * 纯函数部分可在 Node 下用 vitest 钉住。
 */

export const FILE_NAME = '.reply-tips.json'

/** 插件名（Client 侧注册名） */
export const name = 'reply-tips'
/** Client 侧硬依赖：槽位系统 */
export const inject = ['slots']

/** 生成失败原因（运行体 diag.reason 的取值，Client 据此显示回退文案）。 */
export type DiagReason =
  | 'no-text'
  | 'no-llm-service'
  | 'no-model-service'
  | 'no-selection'
  | 'stream-threw'
  | 'finish-error'
  | 'truncated'
  | 'parse-failed'

/** 会话事件（运行体回扫只读 type/data，其余字段不关心）。 */
export interface SessionEventLike {
  type?: string
  data?: unknown
}

/** 会话的最小可读面（agent.session 或快照）。 */
export interface SessionLike {
  events?: readonly SessionEventLike[]
}

/** 一轮的配对：最新 finalized 回复 + 它之前最近的用户提问。 */
export interface TurnPair {
  reply: string
  question: string
}

/** 解析模型输出的结果：解析成功带 how，失败为空数组 + how 'none'。 */
export interface ParsedOutput {
  parsed: string[]
  how: 'json' | 'lines' | 'none'
}

/**
 * 从会话事件里取「最新一轮」的配对。
 *
 * 单次从尾部回扫：先定位最新一条 finalized 助手回复（assistant/message 的
 * data.message.content 里所有 text 块拼接）；再继续向前找它**之前**最近一条真实用户
 * 提问（user/message 且 source.kind === 'user'）作为 question。限定提问在回复之前，
 * 保证两者同属一轮，不会拿下一轮的问题配上一轮的回复。
 *
 * @param session - 会话（读 session.events）。
 * @returns reply 可能为 ''（尚无回复）；question 可能为 ''（回复前没有用户提问）。
 */
export function latestTurnPair(session: SessionLike): TurnPair {
  const events = session?.events ?? []
  let reply = ''
  let question = ''
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i]
    if (!ev || typeof ev.type !== 'string') continue
    if (ev.type === 'assistant/message') {
      if (reply !== '') continue
      const text = messageText(dataOf(ev))
      if (text.trim() !== '') reply = text
      continue
    }
    if (ev.type === 'user/message' && reply !== '' && question === '') {
      const um = ev.data as { source?: { kind?: string }; content?: ContentBlockLike[] } | undefined
      const src = um?.source
      if (!src || src.kind !== 'user') continue
      const text = (um?.content ?? [])
        .filter((b): b is TextBlockLike => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
      if (text.trim() !== '') {
        question = text
        break
      }
    }
  }
  return { reply, question }
}

/** 消息内容块的最小形状（text 块；其他块忽略）。 */
export interface TextBlockLike {
  type: 'text'
  text: string
}
interface ContentBlockLike {
  type?: string
  text?: string
}

/** 取 assistant/message 的 data.message（data 结构随事件演进，容错取消息体）。 */
function dataOf(ev: SessionEventLike): { content?: ContentBlockLike[] } | undefined {
  const data = ev.data as { message?: { content?: ContentBlockLike[] } } | undefined
  const message = data?.message
  return message ?? undefined
}

/** 从 data.message.content 里拼 text 块。 */
function messageText(message: { content?: ContentBlockLike[] } | undefined): string {
  return (message?.content ?? [])
    .filter((b): b is TextBlockLike => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
}

/**
 * 规则兜底：模型调用不可用时，根据回复文本特征给一组固定建议。
 * 空文本 → []；含代码围栏 → 解释/风险；含点号文件名 → 改了什么；长文 → 总结/简化；
 * 否则兜底「展开讲讲」。去重，最多 4 条。
 * @param text - 助手回复的纯文本。
 */
export function fallbackTips(text: string): string[] {
  const t = (text ?? '').trim()
  if (t === '') return []
  const tips: string[] = []
  if (t.includes('```')) {
    tips.push('解释这段代码')
    tips.push('指出这段代码的风险')
  }
  if (/[A-Za-z0-9_.-]+\.[A-Za-z0-9]+/.test(t)) tips.push('这个文件改了什么')
  if (t.length >= 80) {
    tips.push('总结要点')
    tips.push('给一个更简单的版本')
  }
  const seen: string[] = []
  for (const tip of tips) {
    if (!seen.includes(tip)) seen.push(tip)
  }
  const result = seen.slice(0, 4)
  if (result.length === 0) result.push('展开讲讲')
  return result
}

/**
 * 构建给模型的提示词：要求顺着用户提问方向生成 2–3 条追问，只输出 JSON 字符串数组。
 * 喂入的是同一轮的 question（可能为空）与 reply（截断到合理长度）。
 */
export function buildSuggestionsPrompt(pair: { question: string; reply: string }): string {
  const ctxText = pair.question !== ''
    ? `\n\n用户的提问：\n${pair.question.slice(0, 2000)}\n\n助手的回复：\n${pair.reply.slice(0, 6000)}`
    : `\n\n助手的回复：\n${pair.reply.slice(0, 6000)}`
  return '你的任务：站在提问用户的角度，顺着「用户提问」的方向，给出 2 到 3 条用户最可能接着问的具体中文追问。'
    + '回复若覆盖多个点，优先顺着用户提问聚焦的方向，不要挑与提问无关的点。'
    + '\n生成质量要求：'
    + '1. 每条必须钉住助手回复里的具体内容——点名它提到的文件、函数、术语、数字或某个论断，像真人顺着话题追问，不写空泛句；'
    + '2. 禁止万能废话：不得使用「展开讲讲」「详细说说」「举个例子」「为什么这样」「继续」「总结一下」这类不看回复也能写出的句子；'
    + '3. 宁缺毋滥：没有实质可追问点时宁可只给 1 条，也要具体有用，不要凑数；每条最多 24 个汉字。'
    + '\n\n要求：只输出一个 JSON 字符串数组，严格用 ASCII 双引号，不要任何解释、序号、代码块围栏、列表符号或其他文字。'
    + '输出必须以 [ 开头、以 ] 结尾。\n'
    + ctxText
}

/** 尝试把一段文本整体当作 JSON 字符串数组解析。解析失败抛错。 */
export function tryParseArray(s: string): string[] {
  const arr = JSON.parse(s)
  if (Array.isArray(arr)) {
    return arr
      .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      .map((x) => x.trim())
      .slice(0, 4)
  }
  return []
}

/** 逐行兜底：剥掉围栏/列表符/引号后把每行当作一条建议。 */
export function linesFallback(out: string): string[] {
  const body = (out ?? '').replace(/```(?:json)?/gi, '').trim()
  const tips: string[] = []
  const lines = body.split('\n')
  for (const line of lines) {
    let t = line.trim()
    if (!t) continue
    t = t.replace(/^[-*•·\d.)、]+\s*/, '').trim()
    t = t.replace(/^["'\u201c\u2018\u300c]+/, '').replace(/["'\u201d\u2019\u300d]+$/, '').trim()
    if (!t) continue
    if (/^[`#]/.test(t)) continue
    if (t.length > 40) continue
    if (!tips.includes(t)) tips.push(t)
    if (tips.length >= 4) break
  }
  return tips
}

/** 逐行兜底失败后再试：从长文里摘取成对引号括起来的短语（模型常把每条用引号包住）。 */
export function quotedFallback(out: string): string[] {
  const body = String(out ?? '')
  const tips: string[] = []
  const re = /["“\u201c'‘\u2018]([^"”\u201d\u2019'\u2018\u201c\u2018\u2019]{1,44})["”\u201d\u2019'\u2019]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null && tips.length < 4) {
    const t = (m[1] ?? '').trim()
    if (t !== '' && !tips.includes(t)) tips.push(t)
  }
  return tips
}

/** 判定是否为垃圾胶囊（纯符号/单括号/JSON 残留等），任何解析路径出口都要过滤。 */
export function isJunkTip(t: string): boolean {
  const s = (t ?? '').trim()
  if (s === '') return true
  if (/^[\[\]{}<>()"'`#*•·_\-—、，。！？：；.…\s]+$/.test(s)) return true
  if (/^[\[{]/.test(s)) return true
  if (/^[\]}]$/.test(s)) return true
  if (s.includes('":"')) return true
  return false
}

const cleanTips = (items: string[]): string[] => {
  const out: string[] = []
  for (const item of items) {
    if (!isJunkTip(item)) out.push(item)
  }
  return out
}

/**
 * 多级解析模型输出：①截取首 [ 到末 ] 试 JSON；②去掉围栏整体试 JSON；③整体试 JSON；
 * ④修尾逗号后试 JSON；⑤逐行兜底；⑥引号摘取兜底。逐级放宽，容错前后缀杂讯；
 * 每级结果都过滤垃圾胶囊（isJunkTip），过滤后为空则进入下一级。
 */
export function parseModelOutput(out: string): ParsedOutput {
  const s = (out ?? '').trim()
  const candidates: string[] = []
  const start = s.indexOf('[')
  const end = s.lastIndexOf(']')
  if (start !== -1 && end !== -1 && end > start) candidates.push(s.slice(start, end + 1))
  const noFence = s.replace(/```(?:json)?/gi, '').trim()
  if (noFence !== s) candidates.push(noFence)
  if (s !== '') candidates.push(s)
  const noTrailingComma = s.replace(/,\s*(?=[\]}])/g, '')
  if (noTrailingComma !== s) candidates.push(noTrailingComma)
  for (const candidate of candidates) {
    try {
      const parsed = cleanTips(tryParseArray(candidate))
      if (parsed.length > 0) return { parsed, how: 'json' }
    } catch {
      /* try next candidate */
    }
  }
  const lines = cleanTips(linesFallback(out))
  if (lines.length > 0) return { parsed: lines, how: 'lines' }
  const quoted = cleanTips(quotedFallback(out))
  if (quoted.length > 0) return { parsed: quoted, how: 'lines' }
  return { parsed: [], how: 'none' }
}

/** 把若干会话的开关状态读写合并进一个 JSON 文件（纯函数，供 Host 侧 fs 调用）。 */
export function withToggle(file: string, sessionId: string, enabled: boolean): string {
  let all: Record<string, boolean> = {}
  if (file.trim() !== '') {
    try {
      const parsed = JSON.parse(file)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) all = parsed
    } catch {
      all = {}
    }
  }
  all[sessionId] = enabled
  return JSON.stringify(all, null, 2)
}

/** 从现有 JSON 文件内容读某会话开关（undefined = 未设置）。 */
export function readToggleFile(file: string | undefined, sessionId: string): boolean | undefined {
  if (!file || file.trim() === '') return undefined
  try {
    const parsed = JSON.parse(file)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed[sessionId] === 'boolean') {
      return parsed[sessionId] as boolean
    }
  } catch {
    /* malformed -> unset */
  }
  return undefined
}

// 运行形态说明：
// 本 example 的实际运行体是「动态 Cordis 插件」的双端（code.host + code.client 纯 JS
// 函数体），不在本文件里（Client 侧需 React/slots 内联、Host 侧需 ctx.get/harness 内联，
// 无法在此静态表达）。本文件保留「可读 + 可测」的 TS 纯函数层，双端 apply 的代码结构
// 与数据流见 README「源码设计（运行体结构）」一节。
