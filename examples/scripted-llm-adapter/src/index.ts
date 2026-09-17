/**
 * 给 harness 接一个不用联网、不要密钥的模型提供方（LLM 适配器实战）。
 *
 * 插件只做一件事：把 `ScriptedAdapter` 注册到 `ctx.llm` 的一条或多条路由上。
 * 注册是副作用，跟着插件生命周期自动回收，所以 HMR 与卸载都不用手工清理。
 * @module scripted-llm-adapter
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { ScriptedAdapter } from './adapter.ts'
import type { ScriptedModelConfig } from './types.ts'

export { ScriptedAdapter } from './adapter.ts'
export { ECHO_PREFIX, lastUserText, planTurn, renderTurn, toolResultText } from './script.ts'
export type { ScriptedModelConfig, ScriptedTurn } from './types.ts'

/** Cordis 插件名。 */
export const name = 'scripted-llm-adapter'

/** 注册适配器前必须等 LLM 运行时就绪。 */
export const inject = ['llm']

/** 插件配置；默认值挂在下面的 schema 字段上。 */
export interface Config {
  /** 该适配器接管的路由名，`GenerateOptions.provider` 与它对应。 */
  providers: string[]
  /** 模型目录；未列出的 id 依然接受，只是没有能力声明。 */
  models: ScriptedModelConfig[]
}

/** 默认目录：一个能跑通演示的模型，带 reasoning 能力声明。 */
const DEFAULT_MODELS: ScriptedModelConfig[] = [
  { id: 'demo', name: 'Scripted demo', contextWindow: 32000, reasoningEfforts: ['off', 'low', 'high'], defaultReasoningEffort: 'low' },
]

/** 模型目录项的校验 schema（Schemastery）。 */
const ModelSchema = Schema.object({
  id: Schema.string().required(),
  name: Schema.string(),
  contextWindow: Schema.number(),
  reasoningEfforts: Schema.array(Schema.string()),
  defaultReasoningEffort: Schema.string(),
})

export const Config: Schema<Config> = Schema.object({
  providers: Schema.array(Schema.string()).default(['scripted']),
  models: Schema.array(ModelSchema).default(DEFAULT_MODELS),
})

/**
 * 挂载插件。
 * @param ctx - 插件上下文，`ctx.llm` 已就绪。
 * @param config - 已校验的配置。
 */
export function apply(ctx: Context, config: Config): void {
  ctx.llm.registerAdapter(config.providers, new ScriptedAdapter(config.models))
}
