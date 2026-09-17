/**
 * 剧本适配器本体：把 `LlmAdapter` 的契约落成一个可运行的提供方。
 *
 * 只实现 `LlmAdapter` 要求的那一个抽象方法 `stream()`，其余三个方法
 * （`providerInfo` / `listModels` / `resolveModel`）按需要覆写，用来演示
 * 「目录是建议性的、能力要如实声明」这两条约定。
 * @module scripted-llm-adapter/adapter
 */

import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { EMPTY_RESPONSE_CODE, LlmAdapter, LlmError, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { planTurn, renderTurn } from './script.ts'
import type { ScriptedModelConfig } from './types.ts'

/** 取消时用来吵醒挂起剧本的信号；没有 signal 就永远等下去（挂起剧本的本意）。 */
function interrupted(signal?: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    const fail = (): void => reject(new Error('the scripted stream was aborted'))
    if (signal?.aborted === true) { fail(); return }
    signal?.addEventListener('abort', fail, { once: true })
  })
}

/** 离线、确定性的模型提供方。 */
export class ScriptedAdapter extends LlmAdapter {
  /**
   * 每次模型调用收到的请求，原样留档。
   * 测试用它断言「模型到底看到了什么」，也用它证明某次调用根本没发生。
   */
  readonly requests: GenerateOptions[] = []

  /**
   * @param models - 该提供方声明的模型目录（可以为空，未列出的 id 也照样接受）。
   */
  constructor(private readonly models: readonly ScriptedModelConfig[] = []) {
    super()
  }

  /**
   * @param provider - 本次注册的路由名。
   * @returns 选择器里显示的提供方信息，`id` 必须原样保留。
   */
  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: `Scripted (${provider})` }
  }

  /**
   * 目录只做展示，不参与路由校验。上下文窗口属于「精确模型元数据」，
   * 不在目录里，所以这里不返回它。
   * @param provider - 本次注册的路由名。
   * @returns 声明的模型列表。
   */
  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(this.models.map(model => ({
      provider,
      id: model.id,
      name: model.name ?? model.id,
    })))
  }

  /**
   * 精确模型元数据。目录里没有的 id 也接受（目录是建议性的），
   * 只是没有任何能力声明。声明了 reasoning 就原样透出，包括 `off`。
   * @param provider - 本次注册的路由名。
   * @param model - 请求里的模型 id。
   * @returns 身份加可选能力。
   */
  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    const declared = this.models.find(candidate => candidate.id === model)
    if (declared === undefined) return Promise.resolve({ provider, id: model, name: model })
    const efforts = declared.reasoningEfforts ?? []
    return Promise.resolve({
      provider,
      id: model,
      name: declared.name ?? model,
      ...declared.contextWindow === undefined ? {} : { context: { contextWindow: declared.contextWindow } },
      ...efforts.length === 0 ? {} : {
        reasoning: {
          efforts: efforts.map(id => ({ id: ReasoningEffortId(id), name: id })),
          ...declared.defaultReasoningEffort === undefined
            ? {}
            : { defaultEffort: ReasoningEffortId(declared.defaultReasoningEffort) },
        },
      },
    })
  }

  /**
   * 发一轮分片。
   * @param options - 组装好的请求，必须尊重 `options.signal`。
   * @returns 遵守 `StreamChunk` 契约的分片流。
   */
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)

    // 剧本不支持停止序列。官方手册要求这种情况「抛带稳定 code 的错误，不许静默丢弃」。
    if (options.stop !== undefined) {
      throw new LlmError('the scripted provider cannot honour stop sequences', 'UNSUPPORTED_OPTION')
    }

    const turn = planTurn(options)
    // 故障第一路径：抛出。运行时会把异常规范化成终态 finish 再交给消费方。
    if (turn.kind === 'failure') throw new LlmError(turn.message, turn.code)
    // 退化补全不能变成一个空的助手消息，要按内核的分类报错。
    if (turn.kind === 'empty') {
      throw new LlmError('the scripted model returned a completion with no content', EMPTY_RESPONSE_CODE)
    }
    // 挂起剧本：先发半截内容，再等取消。取消后抛错，由运行时按 signal 归类成 aborted。
    if (turn.kind === 'hang') {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'partial' }
      await interrupted(options.signal)
      return
    }

    for (const chunk of renderTurn(turn, options)) {
      if (options.signal?.aborted === true) throw new Error('the scripted stream was aborted')
      yield chunk
    }
  }
}
