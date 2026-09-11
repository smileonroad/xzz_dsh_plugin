/**
 * reply-tips Host 入口（静态 Cordis 插件 + Typert Remote 服务）。
 *
 * 浏览器半边走 `./client`；wire 产物由 `@deepseek-ai/dsh-typert-generator` 生成到
 * `lib/typert.host.js`（Host 清单）与 `lib/typert.remote-client.js`（客户端 contribution）。
 * 生成器只分析**包导出入口**可达的声明，所以服务类必须从本文件导出，且 Remote 边界类型
 * 从 `./types` 子路径导出。
 *
 * 运行语义与动态版 `dynamic/code.host.js` 一致：mem 开关 + fs 落盘唯一真源；会话事件回扫
 * 同轮配对；`llm.stream` 真生成 + 多级解析 + 垃圾过滤；稳定性闸门（同一回复连续两次观测
 * 一致才定稿）；`notOld` 保证新一批落库前不塞回旧缓存。纯函数层在 `./core.ts`。
 *
 * @module @smileonroad/dsh-reply-tips
 */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  FILE_NAME, buildSuggestionsPrompt, fallbackTips, latestTurnPair, parseModelOutput, readToggleFile, withToggle,
} from './core.ts'
import type { SessionEventLike } from './core.ts'
import type {
  ReplyTipsGetRequest, ReplyTipsGetResult, ReplyTipsSetRequest, ReplyTipsSetResult,
  ReplyTipsState, ReplyTipsSuggestionsRequest, ReplyTipsSuggestionsResult,
} from './types.ts'

export * from './core.ts'

/** 会话查询服务的最小可读面。 */
interface SessionQueryService {
  readSession(sessionId: string): Promise<{ events?: readonly SessionEventLike[] } | undefined>
}

/** 工作区文件服务的最小面（resolve + 读写文本）。 */
interface FsService {
  resolve(path: string, options: Record<string, unknown>): Promise<unknown>
  readText(target: unknown): Promise<string>
  writeText(target: unknown, content: string): Promise<void>
}

/** agent 注册表的最小面。 */
interface AgentsService {
  get(sessionId: string): unknown
}

/** 默认模型选择服务的最小面。 */
interface DefaultModelService {
  currentSelection(): unknown
}

/** 一条 LLM 流分片（只关心文本增量与结束原因）。 */
interface LlmChunk {
  type?: string
  text?: string
  reason?: unknown
}

/** LLM 服务的最小面。 */
interface LlmService {
  stream(request: Record<string, unknown>): AsyncIterable<LlmChunk>
}

/** 一次生成尝试的产物。 */
interface GenerationResult {
  tips: string[]
  reason: string | null
}

/** 缓存记录：最近一次交付结果 + 它对应的回复文本。 */
interface CacheRecord {
  reply: string
  tips: string[]
  reason: string | null
}

/**
 * 从任意 agent 形状里取会话工作目录。
 * @param agent - agents 服务返回的 agent。
 * @returns 工作目录，取不到时 undefined。
 */
function cwdOf(agent: unknown): string | undefined {
  if (agent === null || typeof agent !== 'object') return undefined
  const record = agent as {
    session?: { header?: { cwd?: unknown }; cwd?: unknown }
    header?: { cwd?: unknown }
  }
  const headerCwd = record.session?.header?.cwd
  if (typeof headerCwd === 'string') return headerCwd
  const sessionCwd = record.session?.cwd
  if (typeof sessionCwd === 'string') return sessionCwd
  const agentCwd = record.header?.cwd
  if (typeof agentCwd === 'string') return agentCwd
  return undefined
}

/** reply-tips 的 Host 服务：开关真源与建议生成。 */
export class ReplyTipsService extends TypertRemoteService {
  static inject = ['sessionQuery', 'sessions', 'agents', 'agentDefaultModel', 'llm', 'fs']

  /** sessionId -> 开关（内存真相）。 */
  private readonly toggles = new Map<string, boolean>()
  /** sessionId -> 最近一次交付结果。 */
  private readonly cacheRec = new Map<string, CacheRecord>()
  /** sessionId -> 生成进行中。 */
  private readonly busy = new Set<string>()
  /** sessionId -> 稳定性闸门观测（同一回复文本连续计数）。 */
  private readonly observed = new Map<string, { reply: string; count: number }>()
  /** sessionId -> 已为新回复发起刷新（新一批落库前禁止回旧缓存）。 */
  private readonly notOld = new Set<string>()

  constructor(ctx: Context) {
    super(ctx, 'replyTips', { namespace: 'replyTips' })
  }

  /**
   * 读开关（mem 优先，miss 读会话工作区文件）。
   * @param request - 目标会话。
   * @returns 当前开关值。
   */
  @Remote('get')
  async get(request: ReplyTipsGetRequest): Promise<ReplyTipsGetResult> {
    const sessionId = request.sessionId
    if (sessionId === '') return { enabled: false }
    return { enabled: await this.readEnabled(sessionId) }
  }

  /**
   * 写开关（乐观写 mem + fs 落盘）。
   * @param request - 目标会话与目标状态。
   * @returns 落定状态与落盘结果。
   */
  @Remote('set')
  async set(request: ReplyTipsSetRequest): Promise<ReplyTipsSetResult> {
    const sessionId = request.sessionId
    if (sessionId === '') return { enabled: false, saved: false }
    this.toggles.set(sessionId, request.enabled)
    const saved = await this.writeEnabled(sessionId, request.enabled)
    return { enabled: request.enabled, saved }
  }

  /**
   * 取追问建议（回合结束边沿 refresh 或轮询 poll）。
   * @param request - 目标会话与刷新标记。
   * @returns 建议、失败原因与交付状态。
   */
  @Remote('get-suggestions')
  async getSuggestions(request: ReplyTipsSuggestionsRequest): Promise<ReplyTipsSuggestionsResult> {
    const sessionId = request.sessionId
    if (sessionId === '') return { suggestions: [], reason: 'no-text', state: 'idle' }
    return await this.generateSuggestions(sessionId, request.refresh === true)
  }

  /** 工作区文件绝对路径（取不到 cwd 时为 undefined）。 */
  private filePathOf(sessionId: string): string | undefined {
    const agents = this.ctx.get('agents') as AgentsService | undefined
    const cwd = agents === undefined ? undefined : cwdOf(agents.get(sessionId))
    return cwd === undefined ? undefined : `${cwd}/${FILE_NAME}`
  }

  /** 经 fs 服务读取文本；不可用时 undefined。 */
  private async readFileText(absPath: string): Promise<string | undefined> {
    const fs = this.ctx.get('fs') as FsService | undefined
    if (fs === undefined) return undefined
    try {
      const target = await fs.resolve(absPath, {})
      return await fs.readText(target)
    } catch {
      return undefined
    }
  }

  /** 经 fs 服务写文本；成功返回 true。 */
  private async writeFileText(absPath: string, content: string): Promise<boolean> {
    const fs = this.ctx.get('fs') as FsService | undefined
    if (fs === undefined) return false
    try {
      const target = await fs.resolve(absPath, {})
      await fs.writeText(target, content)
      return true
    } catch {
      return false
    }
  }

  /** 读开关：mem 命中直接用，否则读文件并回填。 */
  private async readEnabled(sessionId: string): Promise<boolean> {
    const cached = this.toggles.get(sessionId)
    if (cached !== undefined) return cached
    const abs = this.filePathOf(sessionId)
    if (abs === undefined) return false
    const file = await this.readFileText(abs)
    const value = readToggleFile(file, sessionId)
    if (value !== undefined) this.toggles.set(sessionId, value)
    return value === true
  }

  /** 写开关：mem 先落，再尽力落盘。 */
  private async writeEnabled(sessionId: string, enabled: boolean): Promise<boolean> {
    const abs = this.filePathOf(sessionId)
    if (abs === undefined) return false
    const file = (await this.readFileText(abs)) ?? ''
    return await this.writeFileText(abs, withToggle(file, sessionId, enabled))
  }

  /** 回扫会话事件：优先 sessionQuery.readSession，失败退回空集。 */
  private async sessionEvents(sessionId: string): Promise<readonly SessionEventLike[]> {
    const query = this.ctx.get('sessionQuery') as SessionQueryService | undefined
    if (query === undefined) return []
    try {
      const snapshot = await query.readSession(sessionId)
      return snapshot?.events ?? []
    } catch {
      return []
    }
  }

  /** 真生成：默认模型 + llm.stream，两轮尝试 + 多级解析 + 规则兜底。 */
  private async runGeneration(pair: { question: string; reply: string }): Promise<GenerationResult> {
    const llm = this.ctx.get('llm') as LlmService | undefined
    if (llm === undefined) return { tips: fallbackTips(pair.reply), reason: 'no-llm-service' }
    const models = this.ctx.get('agentDefaultModel') as DefaultModelService | undefined
    const selection = (models?.currentSelection() ?? undefined) as { provider?: unknown; model?: unknown } | undefined
    const provider = selection?.provider
    const model = selection?.model
    if (typeof provider !== 'string' || typeof model !== 'string') {
      return { tips: fallbackTips(pair.reply), reason: 'no-selection' }
    }
    const prompt = buildSuggestionsPrompt(pair)
    let out = ''
    let finish = ''
    for (let attempt = 1; attempt <= 2 && out.trim() === ''; attempt += 1) {
      out = ''
      finish = ''
      const usePrompt = attempt === 1
        ? prompt
        : `${prompt}\n注意：不要输出任何思考/推理过程；思考请尽量简短，直接给出最终 JSON 数组。`
      const stream = llm.stream({
        provider,
        model,
        messages: [{ role: 'user', content: [{ type: 'text', text: usePrompt }] }],
        temperature: attempt === 1 ? 0 : 0.2,
        maxTokens: 8000,
        reasoningEffort: 'off',
      })
      try {
        for await (const chunk of stream) {
          if (chunk.type === 'text-delta' && typeof chunk.text === 'string') out += chunk.text
          else if (chunk.type === 'finish') finish = finishOf(chunk.reason)
        }
      } catch {
        return { tips: fallbackTips(pair.reply), reason: 'stream-threw' }
      }
    }
    if (finish === 'length' || finish === 'max-tokens') {
      return { tips: fallbackTips(pair.reply), reason: `truncated(finish:${finish})` }
    }
    const parsed = parseModelOutput(out)
    if (parsed.parsed.length === 0) {
      const raw = out.replace(/\s+/g, ' ').slice(0, 120)
      return { tips: fallbackTips(pair.reply), reason: `parse-failed(len:${out.length},finish:${finish},raw:${raw})` }
    }
    return { tips: parsed.parsed, reason: null }
  }

  /** 前台判定 + 闸门 + 缓存；真正生成在 busy 保护下进行。 */
  private async generateSuggestions(sessionId: string, refresh: boolean): Promise<ReplyTipsSuggestionsResult> {
    const events = await this.sessionEvents(sessionId)
    const pair = latestTurnPair({ events })
    if (pair.reply.trim() === '') {
      return { suggestions: [], reason: 'no-text', state: 'idle' }
    }
    const last = this.cacheRec.get(sessionId)
    if (last !== undefined && last.reply === pair.reply) {
      this.notOld.delete(sessionId)
      return { suggestions: last.tips, reason: last.reason, state: 'fresh' }
    }
    if (refresh) this.notOld.add(sessionId)
    const current = this.observed.get(sessionId)
    const next = current !== undefined && current.reply === pair.reply
      ? { reply: pair.reply, count: current.count + 1 }
      : { reply: pair.reply, count: 1 }
    this.observed.set(sessionId, next)
    if (next.count < 2) {
      if (last !== undefined && !this.notOld.has(sessionId)) {
        return { suggestions: last.tips, reason: last.reason, state: 'fresh' }
      }
      return { suggestions: [], reason: null, state: 'generating' }
    }
    if (this.busy.has(sessionId)) {
      if (this.notOld.has(sessionId)) return { suggestions: [], reason: null, state: 'generating' }
      return { suggestions: last?.tips ?? [], reason: last?.reason ?? null, state: 'fresh' }
    }
    this.busy.add(sessionId)
    try {
      const result = await this.runGeneration(pair)
      this.cacheRec.set(sessionId, { reply: pair.reply, tips: result.tips, reason: result.reason })
      this.notOld.delete(sessionId)
      const state: ReplyTipsState = 'fresh'
      return { suggestions: result.tips, reason: result.reason, state }
    } finally {
      this.busy.delete(sessionId)
    }
  }
}

/** 归一 finish 原因（可能是字符串、对象或 undefined）。 */
function finishOf(reason: unknown): string {
  if (typeof reason === 'string') return reason
  if (reason !== null && typeof reason === 'object') {
    const record = reason as { reason?: unknown; kind?: unknown }
    if (typeof record.reason === 'string') return record.reason
    if (typeof record.kind === 'string') return record.kind
    return JSON.stringify(reason)
  }
  return String(reason ?? '')
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** reply-tips 的 Host 服务（Typert Remote 命名空间 replyTips）。 */
    replyTips: ReplyTipsService
  }
}

/** Cordis 插件名。 */
export const name = 'reply-tips'

/**
 * 挂载 Host 半边：实例化远程服务。
 * @param ctx - Host 根 context。
 */
export function apply(ctx: Context): void {
  void new ReplyTipsService(ctx)
}
