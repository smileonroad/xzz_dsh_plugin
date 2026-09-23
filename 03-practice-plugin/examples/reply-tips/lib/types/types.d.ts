/**
 * reply-tips 的 wire 类型（Remote 边界类型必须从公共的 `./types` 子路径导出）。
 *
 * 生成器把这里的类型投影成 strict codec；Host 清单与客户端 contribution 共用同一份声明。
 * 只允许 JSON 形状：字符串、布尔、数组、字面量联合与 null。
 *
 * @module @smileonroad/dsh-reply-tips/types
 */

/** 读某个会话的推荐开关。 */
export interface ReplyTipsGetRequest {
  /** 目标会话 id。 */
  readonly sessionId: string
}

/** 开关读取结果。 */
export interface ReplyTipsGetResult {
  /** 当前是否开启推荐提示。 */
  readonly enabled: boolean
}

/** 写某个会话的推荐开关。 */
export interface ReplyTipsSetRequest {
  /** 目标会话 id。 */
  readonly sessionId: string
  /** 目标状态。 */
  readonly enabled: boolean
}

/** 开关写入结果。 */
export interface ReplyTipsSetResult {
  /** 落定后的状态（写失败时保留原值）。 */
  readonly enabled: boolean
  /** 是否成功落盘（内存态始终生效）。 */
  readonly saved: boolean
}

/** 拉取某个会话的追问建议。 */
export interface ReplyTipsSuggestionsRequest {
  /** 目标会话 id。 */
  readonly sessionId: string
  /** true 表示回合结束边沿刷新（先清空旧胶囊，等新一批定稿）。 */
  readonly refresh: boolean
}

/** 建议交付状态。 */
export type ReplyTipsState = 'idle' | 'generating' | 'fresh'

/** 追问建议结果。 */
export interface ReplyTipsSuggestionsResult {
  /** 建议文本（最多 4 条；生成中或未定稿时为空数组）。 */
  readonly suggestions: readonly string[]
  /** 生成失败原因，成功时为 null（客户端据此显示回退提示）。 */
  readonly reason: string | null
  /** 交付状态。 */
  readonly state: ReplyTipsState
}
