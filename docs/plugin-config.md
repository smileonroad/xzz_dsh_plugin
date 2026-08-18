# 插件配置（config）

摘要对应上游：`reference/basic/config.md`（deepseek-harness `docs/user/develop/basic/config.md`）。实战印证：`examples/csv-query-tool/`。

## 机制

插件导出**同名**的类型与 schema，框架即按 Standard Schema 校验并注入：

```ts
import Schema from '@deepseek-ai/schemastery'

export interface Config { greeting: string; maxRetries: number; verbose?: boolean }
export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  maxRetries: Schema.number().default(3),
  verbose: Schema.boolean().default(false),
})

export function apply(ctx: Context, config: Config) { /* config 已校验、已填默认 */ }
```

要点：

- **同名导出是约定**（`Config` 类型 + `Config` schema），cordis 靠它找到配置 schema；schema 实现 Standard Schema 接口（zod 也可以，dsh 包两套都有，官方教程用 Schemastery）。
- **默认值写在 schema 字段上**，不是类型里；省略的字段自动填默认。
- `apply` 第二参数即校验后的配置；第一参数 `ctx` 不变。
- 配置来源：`cordis.yml` 的 `config:` 字段（Loader 路径）、`ctx.plugin(plugin, config)`（测试路径）、bundle patch 层。框架统一处理，`config` 未传时全部走默认。
- 配置与调用参数的分层：配置是部署者定的回退值，模型调用时传入的参数优先（`args.delimiter ?? config.defaultDelimiter` 这种一行分层）。

## 测试

- `ctx.plugin(csvQueryTool, { defaultDelimiter: ';', maxRows: 5 })` 直接传配置对象。
- 行为断言分别覆盖「配置生效」与「参数覆盖配置」，把分层钉死。

## 实战踩坑（csv-query-tool）

- CSV 解析器第一版引号 peek 用 `indexOf` 找「下一个引号」实际永远找到第一个，改索引循环才正确——复杂状态机逻辑务必先写测试。
- `maxRows` 作为解析器硬上限（防大文件拖垮 host）做成配置项，安全边界即配置。
