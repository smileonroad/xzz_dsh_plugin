# sql-check-tool 示例

[English](README.md) | 中文

一个面向模型的工具插件：`sql_check` 用 Node 内置的 `node:sqlite` 调用**真实 SQLite 解析器**校验 SQL——零第三方依赖。它演示了 [`ctx.tools`](../../packages/core/tools/README.md) 扩展点，契约比斜杠命令刻意更丰富。

## 运行

本目录是插件源码的**权威来源**。要运行，先把它拷贝到 deepseek-harness 源码的 `examples/`（那边的同名目录可能不同步），再在 deepseek-harness 根目录操作：

```sh
# 1. 拷贝到 deepseek-harness 源码（本仓库是权威来源）
cp -r examples/sql-check-tool ../deepseek-harness/examples/sql-check-tool

# 2a. 跑测试
cd ../deepseek-harness
pnpm exec vitest run examples/sql-check-tool/tests/sql-check-tool.spec.ts

# 2b. 或挂载进 web UI（临时，用 patch 层）
pnpm dsh web --patch examples/sql-check-tool/sql-check.patch.yml
```

> 注意：web 的 HMR 在发布版默认禁用——加完插件后必须重启 web 进程，工具才会出现。
>
> 注意：patch 里 entry 的 `name` 相对 **profile 目录**（`~/.dsh/profiles/web/`）解析，不是相对本文件。`sql-check.patch.yml` 用相对路径 + profile 目录下 junction 的方式，首次使用先建 junction（Windows，无需管理员）：
>
> ```sh
> cmd //c "mklink /J %USERPROFILE%\.dsh\profiles\web\examples <deepseek-harness>\examples"
> ```
>
> 不想用 junction 就改回绝对 `file:///` URL（规则见该文件顶部注释，另有 DSH_HOME 同盘、bundle 安装两种替代）。

在 web UI 里让模型做类似 *"用 sql_check 验证一下 `SELECT FROM WHERE`"* 的事——模型会自己调用工具并收到结构化结果。已验证端到端（2026-08-16）：模型自主调用了 `sql_check`，读到结构化结果 `{ valid: false, errors: [{ type: 'syntax', ... }] }` 后正确总结出 *"syntax error near \"FROM\""*；重新打开会话，工具调用卡片、工具结果与模型回复全部从会话日志重放渲染，会话的轨迹视图里也能看到 `sql_check` 的调用记录（工具名、参数、结果一应俱全）。这就是三层验证闭环：dump-config（挂载）、测试（行为）、真实模型轮次（web 端到端）。

## 设计思路

工具是命令的镜像：命令是人不经模型轮次触发的确定性动作；**工具是模型自主选择调用的动作**。因此工具要说模型的语言：

- **规范值（canonical value）是 JSON 而不是散文。** `sql_check` 返回 `{ valid: boolean, errors: [{ type, message }] }`。模型可以直接按 `valid` 分支、逐条读错误，而不是解析文本。
- **不好的领域结果依然是成功结果。** 无效 SQL 不抛异常——它返回 `{ valid: false, errors: [...] }`，是再正常不过的规范值。throw 只留给基础设施故障（这里指一切非 SQLite 本身的错误）。这是 cookbook 的规则，它让工具失败可路由，而不是让 agent 循环崩溃。
- **错误为调用方分类。** SQLite 的原始消息被映射为 `syntax` / `no-such-table` / `empty` / `other`，模型（或策略钩子）可以按类别分别应对。
- **UI 卡片是纯投影。** `presentCall` / `presentResult` 是 `args` 与持久化 `presentationMeta` 的纯函数——它们既跑在实时流上，也跑在会话日志**重放**上，绝不能碰 I/O 或会话状态。完成卡片的标题（`sql_check: valid` / `sql_check: 2 error(s)`）在重放时从 `meta` 重建。
- **零第三方依赖。** 检查器就是真实 SQLite 解析器，通过 Node 内置的 `node:sqlite`（`DatabaseSync`）调用——与 dsh 官方 `session-query-sqlite` 包的选择一致。每次调用新建一个 `:memory:` 库，获得权威解析且无持久化、无跨调用状态。

诚实的边界：检查器只说 **SQLite 方言**。为 MySQL 或 PostgreSQL 写的 SQL 可能按 SQLite 语法通过或失败；description 里已告诉模型这一点。

## 如何开发

```
sql-check-tool/
├── src/index.ts                 # 插件：name / inject / apply
├── tests/sql-check-tool.spec.ts # 8 个用例，真实 ToolRuntime + SystemPrompt
├── cordis.yml                   # 测试组合（system-prompt + tools + 插件）
└── sql-check.patch.yml          # web overlay 入口
```

> 关系说明：本目录是 `sql_check` 工具的完整源码+测试包；`notes/2026-08-16-sql-check-tool.md` 记录了背后的学习心得。

- `src/index.ts` —— `name = 'sql-check-tool'`，`inject = ['tools']`（Cordis 等待工具注册表就绪），经 `defineTool` 注册 `sql_check`。
- `tests/sql-check-tool.spec.ts` —— 挂载真实的 `SystemPrompt` + `ToolRuntime`，经 `ctx.tools.execute()`（与 agent 循环相同的边界）执行。八个用例覆盖：注册 + schema 流入系统提示词装配、有效 SQL、多语句脚本、语法错误分类、表不存在分类、空输入处理、参数自动校验、presenter 纯函数。

运行测试：

```sh
pnpm exec vitest run examples/sql-check-tool/tests/sql-check-tool.spec.ts
```

## 如何发布应用

与 helloworld-command 示例同一条路：本目录是**教学示例**，不是可安装的包。要分发，把它提升到 `packages/` 下作为标准 bundle，遵循[打包教程](../../docs/user/develop/basic/publish.md)，再用 `dsh plugin --profile <name> add <package>` 安装。本示例消费端不需要任何构建步骤（`node:sqlite` 随 Node 自带）。
