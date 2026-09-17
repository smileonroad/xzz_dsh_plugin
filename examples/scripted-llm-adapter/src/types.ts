/**
 * 剧本模型（offline provider）的词汇表。
 *
 * 这些类型只描述「这一轮模型打算说什么」，不涉及任何厂商协议。
 * `script.ts` 从进入的 `GenerateOptions` 推导出一个 `ScriptedTurn`，
 * `adapter.ts` 再把它翻成规范分片流（`StreamChunk`）。
 */

/** 剧本模型声明的一个 provider/model 路由。 */
export interface ScriptedModelConfig {
  /** 模型 id，等于 `GenerateOptions.model`。 */
  id: string
  /** 选择器里显示的名字；缺省时用 id。 */
  name?: string
  /** 声明的上下文窗口（token）；缺省表示不声明，而不是 0。 */
  contextWindow?: number
  /**
   * 有序的 reasoning 强度 id。原样透出给 harness，
   * 适配器支持 `off` 时就如实写 `off`，不要自作主张删掉。
   */
  reasoningEfforts?: string[]
  /** 调用方没指定强度时落到的默认值；缺省表示不声明默认。 */
  defaultReasoningEffort?: string
}

/**
 * 本轮模型要产生的内容。
 *
 * `failure` / `provider-error` / `empty` / `hang` 是四种失败或异常剧本形态，
 * 分别对应规范协议里不同的错误路径（见 README 的「怎么写剧本」）。
 */
export type ScriptedTurn =
  /** 先说一段思考，再说一段可见文本（用来练多块的 index 分配）。 */
  | { kind: 'text'; text: string; reasoning?: string }
  /** 要求调用一个工具；`arguments` 保持原始 JSON 字符串，不做解析后的对象。 */
  | { kind: 'tool-call'; name: string; arguments: string; text?: string }
  /** 抛 `LlmError`，走「传输/协议故障」这条路径。 */
  | { kind: 'failure'; code: string; message: string }
  /** 以 `finish { kind: 'error' }` 收流，走「提供方带内故障」这条路径。 */
  | { kind: 'provider-error'; code: string; message: string }
  /** 正常结束但一个内容块都没有，适配器据此抛 `EMPTY_RESPONSE`。 */
  | { kind: 'empty' }
  /** 发半截文本后停住，等 `options.signal` 中止（用来练取消）。 */
  | { kind: 'hang' }
