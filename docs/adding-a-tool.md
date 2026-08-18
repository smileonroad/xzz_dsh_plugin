# 添加模型工具

> 摘要：`ctx.tools` + `defineTool` 的约定：最小形态、execute 规则、后台任务、执行策略、Code Mode 触达、UI 渲染。
> 上游：[`reference/cookbook/adding-a-tool.zh.md`](../reference/cookbook/adding-a-tool.zh.md)；
> 按步骤新手教程见 deepseek-harness `docs/user/develop/basic/tool.md`；生产级三包示例 `packages/shell/tool-bash`。

## 最小形态

```ts
export const name = 'my-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'read_file',
    description: 'Read a file from disk.',      // 模型看到的就是它
    parameters: {
      path: { type: 'string', required: true, description: 'Absolute path' },
      limit: { type: 'number' },                 // 默认可选
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      // args 由 schema 推导出类型；exec 带不可变身份 + token；signal 是操作字段
      return readFile(args.path, { encoding: 'utf8', signal: exec.signal })
    },
  }))
}
```

注册是副作用：dispose 插件 fiber 即注销工具。schema 自动流入系统提示词组装。

## execute() 规则要点

- **参数已校验**：`defineTool` 按 `ParameterSchemaSpec` 在 execute 前校验模型参数（类型/必填/字面量/联合/嵌套）；schema DSL 表达不了的（非空串、正数、跨字段）自己查。
- **注册借用只读定义**：注册后不修改 schema、不替换回调；热替换 = dispose 副作用 + 注册替代品。
- **执行身份受保护**：arguments 被物化为无损 JSON 并冻结，`exec.token` 不透明；`exec.signal` 必填、由调用方持有，around-dispatch 包装器可替换它施加截止时间但不能移除。
- **返回规范 JSON 值**：`output.schema` 用 `ValueSchemaSpec`（根可为对象/数组/标量/null）；execute 只返回推导值，注册表快照、校验、冻结后交给 `output.render`。**工具主体不返回内容块**。
- **异常或无效值 = isError**；成功的领域结果即使不理想也写进规范值，由 Native 渲染器解释（如非零退出）。
- **遵守 `exec.signal`**：信号触发即取消。
- `output.presentationMeta(args, value)`：从规范值派生可回放 JSON，持久化在 `tool/result` 上，卡片回放用（如 write/edit 的已应用 hunk）。
- `exec.agent` 发异步通知：`agent.inject({ content, source: { kind: 'plugin', plugin: '<name>' } })` 追加持久化上下文，下次模型请求可见，不唤醒空闲 agent。

## 长时间运行

`run_in_background` + `ctx.jobs.start({ kind, label, owner: exec.agent, run })`。成功返回类型化句柄 `{ kind: 'background', jobId }`；**Code Mode 绝不解析自然语言文本取 id**。预先中止的调用判失败（没有任务 id）。任务发布后用任务自己的取消信号，不再用 `exec.signal`；`job_kill`、owner dispose、teardown 拥有任务生命周期。

## 执行策略与观测（不要内建到工具）

- `tools/pre-execute`：允许/拒绝/询问策略（权限门禁）
- `ctx.tools.guard()`：最终单调拒绝，后续监听器无法撤销
- `tools/execute`：截止时间、重试、指标
- `tools/post-execute`：替换展示/返回值、阻止结果、附加模型可见上下文
- `tools/result`：观测不可变归一化结果

## Code Mode 自动触达

每个可见已注册工具都可 `await tools.<name>(args)`，参数/返回类型从同一组 schema 派生，调用重进正常执行流水线。成功解析为策略处理后的规范 JSON（不是渲染后内容）；失败以 `ToolCallError` reject（只能查 name/toolName/message）。所以 `output.schema` 要设计成实用程序化 API：直接返回句柄与字段，人话放 `output.render`。

## UI 卡片（与模型可见内容分离）

`output.render` 给模型；卡片是独立关注点，用 `presentCall` / `presentResult` 声明（纯展示投影）。卡片类型：`generic`（默认）、`terminal`（shell 命令）、`diff`（建/改文件，`oldText: null` 表示新文件）、`search`（grep/glob 发现型，`shape: 'matches' | 'paths'`）、`web`（检索，`kind: 'search' | 'fetch'`）。

硬性规则：展示器必须是纯函数（实时流式和回放都会运行，不做 I/O、不读会话状态、不用时钟）；UI 格式（```console 围栏、diff、相对路径）不进规范值/Native 内容；展示路径失败返回 `undefined` 回退通用卡片，**绝不崩溃回放**。

## 验证

面向模型或 UI 的变更必须提供组装覆盖（见 deepseek-harness `docs/testing.md` 与所属包测试文档）。
