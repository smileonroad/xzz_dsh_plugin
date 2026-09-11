/**
 * reply-tips Client 半边（浏览器）。
 *
 * 与动态版 `dynamic/code.client.js` 同一套时序：每会话一个 controller；回合结束边沿
 * （`session.running` true→false）先清空旧胶囊并显示「获取中」，再由服务端闸门定稿；
 * 未做刷新的 800ms 轮询兜底保留旧胶囊。开关与建议都来自 Host 的 `replyTips` 命名空间，
 * 浏览器不缓存持久状态。
 *
 * 本包自己 mount 生成的 Remote contribution（`ctx.remote.$mount`），不依赖内嵌装配表；
 * React 与 zod 由构建期处理（react 走模块表 require，zod 内联）。
 *
 * @module @smileonroad/dsh-reply-tips/client
 */

import type { Context } from '@deepseek-ai/cordis'
import TYPERT_REMOTE from '@smileonroad/dsh-reply-tips/remote'
import type { ReplyTipsState, ReplyTipsGetRequest, ReplyTipsGetResult, ReplyTipsSetRequest, ReplyTipsSetResult, ReplyTipsSuggestionsRequest, ReplyTipsSuggestionsResult } from './types.ts'

/**
 * 最小 remote 面。独立包不 import 内嵌的客户端装配类型（那会把整个 in-box 远程面
 * 拖进 typert 分析），改为自持声明 + 一次断言；运行期拿到的是装配服务本身。
 */
interface RemoteResultLike<T> {
  readonly ok: boolean
  readonly value: T
  readonly error: { readonly code: string }
}

interface ReplyTipsRemote {
  get(request: ReplyTipsGetRequest): Promise<RemoteResultLike<ReplyTipsGetResult>>
  set(request: ReplyTipsSetRequest): Promise<RemoteResultLike<ReplyTipsSetResult>>
  'get-suggestions'(request: ReplyTipsSuggestionsRequest): Promise<RemoteResultLike<ReplyTipsSuggestionsResult>>
}

interface RemoteService {
  replyTips: ReplyTipsRemote
  $mount(contribution: unknown): Promise<() => Promise<void>>
}

/** 取浏览器 remote 服务（装配在浏览器根 context 上）。 */
function remoteOf(ctx: Context): RemoteService {
  return (ctx as unknown as { remote: RemoteService }).remote
}

/**
 * React 由浏览器模块表提供（构建期为 `const React = require("react")`），
 * 所以这里用 ambient 声明而不是 import —— 与动态半边「零 import」的形态一致。
 */
declare const React: {
  createElement(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): unknown
  useState<T>(initial: T): [T, (value: T) => void]
  useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void
  useMemo<T>(factory: () => T, deps: readonly unknown[]): T
  useRef<T>(initial: T): { current: T }
}

/** 槽位服务的最小面。 */
interface SlotsService {
  inject(name: string, callback: () => unknown): unknown
  register(options: Record<string, unknown>, component: unknown): unknown
}

/** 浏览器时间服务的最小面（动态半边没有 setInterval 全局）。 */
interface TimerService {
  interval(callback: () => void, ms: number): (() => void) | undefined
}

/** 会话作用域槽组件收到的 props（只用得到的字段）。 */
interface SlotProps {
  readonly sessionId?: unknown
  readonly session?: { readonly header?: { readonly id?: unknown } }
  readonly inputActions?: {
    setDraft(text: string): void
    submit(): void
  }
  readonly input?: { readonly phase?: unknown }
  readonly useSession?: (selector: (session: { running?: unknown } | undefined) => unknown) => unknown
}

/** controller 状态快照。 */
interface ApiState {
  enabled: boolean
  ready: boolean
  saving: boolean
  tips: readonly string[]
  reason: string | null | undefined
  err: string | undefined
  loading: boolean
  fetching: boolean
}

/** 每会话的开关/建议 controller。 */
interface SessionApi {
  state: ApiState
  listeners: Set<() => void>
  snapshot(): ApiState
  notify(): void
  ensure(): Promise<void>
  setEnabled(enabled: boolean): Promise<void>
  fetchTips(mode: 'poll' | 'refresh'): Promise<void>
  beginFetch(): Promise<void>
  subscribe(listener: () => void): () => void
}

const controllers = new Map<string, SessionApi>()

/** 取会话 id（props 直给，或从 session.header.id 兜底）。 */
function sessionIdOf(props: SlotProps): string {
  const direct = props.sessionId
  if (typeof direct === 'string' && direct !== '') return direct
  const headerId = props.session?.header?.id
  if (typeof headerId === 'string') return headerId
  return ''
}

/** 输入机忙状态（正在 adjudicate / submit）。 */
function busyOf(props: SlotProps): boolean {
  const phase = props.input?.phase
  return phase === 'adjudicating' || phase === 'submitting'
}

/** 把建议填进 composer 并走正路发送。 */
function sendTip(props: SlotProps, text: string): void {
  const actions = props.inputActions
  if (actions === undefined || text === '') return
  actions.setDraft('')
  actions.setDraft(text)
  actions.submit()
}

/**
 * 取得（或建立）某会话的 controller。Remote 调用一律走 `remoteOf(ctx).replyTips`，
 * `RemoteResult` 的失败分支收成 `err` 文案，不抛出到组件树。
 */
function apiFor(ctx: Context, sessionId: string): SessionApi {
  const existing = controllers.get(sessionId)
  if (existing !== undefined) return existing
  const api: SessionApi = {
    state: { enabled: false, ready: false, saving: false, tips: [], reason: undefined, err: undefined, loading: false, fetching: false },
    listeners: new Set(),
    snapshot() { return api.state },
    notify() {
      for (const listener of [...api.listeners]) {
        try { listener() } catch { /* listener errors never break the notifier */ }
      }
    },
    async ensure() {
      if (api.state.ready) return
      const result = await remoteOf(ctx).replyTips.get({ sessionId })
      api.state = result.ok
        ? { ...api.state, enabled: result.value.enabled, ready: true, err: undefined }
        : { ...api.state, ready: true, err: `${result.error.code}` }
      api.notify()
    },
    async setEnabled(enabled: boolean) {
      const previous = api.state.enabled
      api.state = { ...api.state, enabled, saving: true, err: undefined }
      api.notify()
      const result = await remoteOf(ctx).replyTips.set({ sessionId, enabled })
      api.state = result.ok
        ? { ...api.state, enabled: result.value.enabled, saving: false, ready: true }
        : { ...api.state, enabled: previous, saving: false, err: `${result.error.code}` }
      api.notify()
    },
    async fetchTips(mode) {
      if (api.state.loading) return
      api.state = { ...api.state, loading: true }
      api.notify()
      const result = await remoteOf(ctx).replyTips['get-suggestions']({ sessionId, refresh: mode === 'refresh' })
      if (!result.ok) {
        api.state = { ...api.state, loading: false, fetching: false, err: `${result.error.code}` }
        api.notify()
        return
      }
      const state: ReplyTipsState = result.value.state
      if (state === 'generating') {
        api.state = { ...api.state, tips: [], reason: undefined, err: undefined, loading: false, fetching: true }
        api.notify()
        return
      }
      api.state = {
        ...api.state,
        tips: result.value.suggestions,
        reason: result.value.reason,
        err: undefined,
        loading: false,
        fetching: false,
      }
      api.notify()
    },
    async beginFetch() {
      api.state = { ...api.state, tips: [], reason: undefined, err: undefined, fetching: true, loading: false }
      api.notify()
      await api.fetchTips('refresh')
    },
    subscribe(listener: () => void) {
      api.listeners.add(listener)
      return () => { api.listeners.delete(listener) }
    },
  }
  controllers.set(sessionId, api)
  return api
}

/** 订阅 controller 快照。 */
function useApiState(api: SessionApi): ApiState {
  const [state, setState] = React.useState<ApiState>(api.snapshot())
  React.useEffect(() => {
    let alive = true
    const unsubscribe = api.subscribe(() => { if (alive) setState(api.snapshot()) })
    return () => { alive = false; unsubscribe() }
  }, [api])
  return state
}

/** 开关按钮：`conversation.input.right`。 */
function ReplyTipsToggle(props: SlotProps): unknown {
  const ctx = currentCtx()
  const sessionId = sessionIdOf(props)
  const api = React.useMemo(() => (sessionId === '' || ctx === undefined ? undefined : apiFor(ctx, sessionId)), [ctx, sessionId])
  const state = useApiState(api ?? emptyApi())
  React.useEffect(() => { void api?.ensure() }, [api])
  if (api === undefined || sessionId === '') return null
  return React.createElement('button', {
    type: 'button',
    'aria-pressed': state.enabled,
    title: state.enabled ? '关闭推荐提示' : '开启推荐提示',
    onClick: () => { void api.setEnabled(!state.enabled) },
    style: {
      marginLeft: '4px',
      fontSize: '12px',
      padding: '2px 6px',
      cursor: 'pointer',
      borderRadius: '6px',
      border: state.enabled ? '1px solid currentColor' : '1px solid transparent',
      opacity: state.saving ? 0.6 : 1,
    },
  }, '💡 推荐')
}

/** 建议行：`conversation.input.dock`。 */
function ReplyTipsRow(props: SlotProps): unknown {
  const ctx = currentCtx()
  const timer = ctx?.get('timer') as TimerService | undefined
  const sessionId = sessionIdOf(props)
  const api = React.useMemo(() => (sessionId === '' || ctx === undefined ? undefined : apiFor(ctx, sessionId)), [ctx, sessionId])
  const state = useApiState(api ?? emptyApi())
  React.useEffect(() => {
    if (api === undefined) return
    void api.ensure()
  }, [api])
  React.useEffect(() => {
    if (api === undefined || !state.enabled) return undefined
    void api.fetchTips('poll')
    const stop = timer?.interval(() => { void api.fetchTips('poll') }, 800)
    return () => { if (stop !== undefined) stop() }
  }, [api, state.enabled, timer])
  const sessionRunning = typeof props.useSession === 'function'
    ? props.useSession((session) => session?.running === true) === true
    : undefined
  const previousRunning = React.useRef<boolean | undefined>(undefined)
  React.useEffect(() => {
    const was = previousRunning.current
    previousRunning.current = sessionRunning
    if (was === true && sessionRunning === false && api !== undefined) void api.beginFetch()
  }, [api, sessionRunning])
  if (api === undefined || !state.enabled) return null
  const busy = busyOf(props)
  const children: unknown[] = []
  if (state.fetching || (state.loading && state.tips.length === 0)) {
    children.push(React.createElement('span', {
      key: 'loading',
      style: { fontSize: '12px', color: 'var(--dsw-text-muted, #888)' },
    }, '推荐问题获取中…'))
  }
  state.tips.forEach((tip, index) => {
    children.push(React.createElement('button', {
      key: `tip${String(index)}`,
      type: 'button',
      disabled: busy,
      title: `发送：${tip}`,
      onClick: () => { if (!busy) sendTip(props, tip) },
      style: {
        fontSize: '12px',
        padding: '2px 10px',
        cursor: busy ? 'default' : 'pointer',
        borderRadius: '999px',
        border: '1px solid rgba(127,127,127,.4)',
        background: 'transparent',
        maxWidth: '48ch',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
    }, `💡 ${tip}`))
  })
  if (state.reason !== null && state.reason !== undefined && state.tips.length > 0) {
    children.push(React.createElement('span', {
      key: 'note',
      style: { fontSize: '11px', color: 'var(--dsw-text-muted, #999)', alignSelf: 'center' },
    }, `生成失败(${state.reason}) 已用规则兜底`))
  }
  if (!state.fetching && !state.loading && state.tips.length === 0) {
    const info = state.reason !== null && state.reason !== undefined
      ? `暂无建议(${state.reason})`
      : (state.err !== undefined ? `调用失败：${state.err}` : '暂无建议')
    children.push(React.createElement('span', {
      key: 'status',
      style: { fontSize: '11px', color: 'var(--dsw-text-muted, #999)', alignSelf: 'center' },
    }, info))
  }
  return React.createElement('div', {
    style: {
      width: '100%',
      maxWidth: 'var(--dsh-composer-card-max-width, 760px)',
      margin: '0 auto',
      padding: '0 4px 4px',
      boxSizing: 'border-box',
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      alignItems: 'center',
    },
  }, children)
}

/** 当前 apply 的 ctx（槽组件经 React context 拿不到，直接用模块级引用）。 */
let activeCtx: Context | undefined

/** 槽组件读取 apply 捕获的 ctx。 */
function currentCtx(): Context | undefined {
  return activeCtx
}

/** 无 controller 时的空快照（hooks 数量必须稳定，实例保持单例）。 */
const EMPTY_API: SessionApi = (() => {
  const state: ApiState = { enabled: false, ready: false, saving: false, tips: [], reason: undefined, err: undefined, loading: false, fetching: false }
  return {
    state,
    listeners: new Set(),
    snapshot: () => state,
    notify: () => {},
    ensure: async () => {},
    setEnabled: async () => {},
    fetchTips: async () => {},
    beginFetch: async () => {},
    subscribe: () => () => {},
  }
})()

/** 无 controller 时的空快照。 */
function emptyApi(): SessionApi {
  return EMPTY_API
}

/** Cordis 插件名。 */
export const name = 'reply-tips'

/** 槽位、浏览器 remote 与时间服务是硬依赖。 */
export const inject = ['slots', 'timer', 'remote']

/**
 * 挂载浏览器半边：先 mount 自己的 Remote contribution，再注册两个槽。
 * @param ctx - 浏览器根 context。
 */
export async function apply(ctx: Context): Promise<void> {
  activeCtx = ctx
  await remoteOf(ctx).$mount(TYPERT_REMOTE)
  const slots = ctx.get('slots') as SlotsService | undefined
  if (slots === undefined) return
  slots.inject('conversation.input.right', () => slots.register({
    name: 'conversation.input.right',
    id: 'reply-tips-toggle',
    order: 10,
    label: () => 'Reply tips toggle',
  }, ReplyTipsToggle))
  slots.inject('conversation.input.dock', () => slots.register({
    name: 'conversation.input.dock',
    id: 'reply-tips-row',
    order: 30,
    label: () => 'Reply tips row',
  }, ReplyTipsRow))
}
