# csv-query-tool 示例

[English](README.md) | 中文

一个面向模型的工具插件：`csv_query` 用手写解析器（零第三方依赖）把 CSV 文档解析成 JSON 行，支持带引号字段、选列、行数限制。相比 sql-check-tool 示例，它多演示两件事：

1. **插件配置** —— `export const Config: Schema<Config>`（Schemastery，与接口同名），默认值写在 schema 字段上，`apply(ctx, config)` 第二参数注入。配置提供工具的安全边界（`maxRows`）与回退值（`defaultDelimiter`）；单次调用参数可以覆盖配置默认（配置默认 < 调用参数）。
2. **Bundle 打包分发** —— `bundle/` 目录是可构建、可安装的 bundle（`dsh.bundle` 清单）。用 `dsh plugin --profile web add` 装进 profile，profile 以 layer 方式启动它——不需要 junction、不需要 `--patch`、不需要绝对路径。

## 运行

本目录是插件源码的**权威来源**。要运行，先把它拷贝到 deepseek-harness 源码的 `examples/`（那边的同名目录可能不同步），再在 deepseek-harness 根目录操作：

```sh
# 1. 拷贝到 deepseek-harness 源码（本仓库是权威来源；先删旧目录，cp -r 目标存在会嵌套）
rm -rf ../deepseek-harness/examples/csv-query-tool
cp -r examples/csv-query-tool ../deepseek-harness/examples/csv-query-tool

# 2a. 跑测试
cd ../deepseek-harness
pnpm exec vitest run examples/csv-query-tool/tests/csv-query-tool.spec.ts

# 2b. 或挂载进 web UI（临时，用 patch 层）
pnpm dsh web --patch examples/csv-query-tool/csv-query.patch.yml
```

> 注意：web 的 HMR 在发布版默认禁用——加完插件后必须重启 web 进程，工具才会出现。

在 web UI 里贴一段 CSV 让模型解析，例如 *"用 csv_query 解析下面的数据并告诉我平均年龄：name,age
xzz,30
alice,25"*。

## 配置

插件通过 `cordis.yml`（Loader 路径）、`ctx.plugin(plugin, config)`（测试路径）或 bundle 层接受配置：

| 配置项 | 类型 | 默认 | 行为 |
|---|---|---|---|
| `defaultDelimiter` | string | `','` | 调用方没传 `delimiter` 参数时使用的分隔符 |
| `maxRows` | number | `1000` | 解析行数硬上限，超出丢弃并置 `truncated: true` |

分层规则：调用参数 `delimiter` 覆盖 `defaultDelimiter`；`limit` 只裁剪返回的行，`totalRows` 保持真实解析数。

已安装的 bundle 层固定了 `maxRows: 2`（见 `bundle/cordis.patch.yml`），用于在 web 端到端中观察配置到达工具：一段 3 行的 CSV 只返回 `Parsed 2 columns, 2 rows (truncated)`，模型会报告截断。注意 pnpm 的 `file:` 依赖是**拷贝**不是链接——改完 bundle 必须 `dsh plugin --profile web remove` 再 `add`，否则 profile 里还是旧副本，config 永远不会出现。

## 设计思路

- **领域结果，不抛异常。** 畸形 CSV 与空输入返回 `{ ok: false, error: { type: 'parse' | 'empty', message, line? } }`，是模型可以直接分支的正常规范值。throw 只留给基础设施故障。
- **诚实的单元格。** 单元格一律字符串（CSV 无类型）；`totalRows` 报告实际解析数，`truncated: true` 告诉模型总数可能不完整。
- **手写解析器。** 带引号字段（内嵌分隔符/换行/`""` 转义）、首个非空行作表头、跳过空行、剥离 BOM、行列不一致时报 1 起始行号。
- **纯函数 presenters。** `presentCall` / `presentResult` 从 `args` 与持久化 `presentationMeta` 派生卡片（重放安全），与 sql-check-tool 一致。

## 如何开发

```
csv-query-tool/
├── src/index.ts                 # 插件：name / inject / Config / apply
├── tests/csv-query-tool.spec.ts # 13 个用例，真实 ToolRuntime + SystemPrompt
├── cordis.yml                   # 测试组合（system-prompt + tools + 插件）
├── csv-query.patch.yml          # web overlay 入口（junction 相对路径）
└── bundle/                      # 可构建 bundle（package.json + 构建产物 index.js + patch）
```

> 关系说明：本目录是 `csv_query` 工具的完整源码+测试包；`notes/2026-08-16-csv-query-tool.md` 记录了背后的学习心得（配置机制 + bundle 分发）。

- `src/index.ts` —— `name = 'csv-query-tool'`，`inject = ['tools']`，`export const Config: Schema<Config>`（Schemastery），经 `defineTool` 注册 `csv_query`。
- `tests/csv-query-tool.spec.ts` —— 挂载真实的 `SystemPrompt` + `ToolRuntime`，经 `ctx.tools.execute()` 执行。十三个用例覆盖：注册 + Config schema、基本解析、引号字段、空行 + BOM、选列、limit + 截断、行列不一致、空输入、配置分隔符、参数覆盖配置、maxRows 上限、参数自动校验、presenter 纯函数。

## 如何发布应用（bundle）

`bundle/` 目录是可安装形态。先构建再安装：

```sh
# 1. 构建 JS bundle（esbuild；external 让 @deepseek-ai/dsh-tools 保持为运行时依赖，
#    从 profile 的 node_modules 解析）
cd examples/csv-query-tool
npx esbuild src/index.ts --bundle --format=esm --platform=node \
  --external:@deepseek-ai/dsh-tools --external:@deepseek-ai/schemastery \
  --outfile=bundle/index.js

# 2. 装进 profile（在 deepseek-harness 根目录）
cd ../..
pnpm dsh plugin --profile web add examples/csv-query-tool/bundle

# 3. 验证 layer，然后启动
pnpm dsh --profile web --dump-config   # 出现 "# == dsh-csv-query-tool" layer
pnpm dsh web
```

### 更新 bundle 三步纪律

bundle 是**分发快照**：构建产物 `index.js` 加清单的拷贝。`src/index.ts` 是权威源码，但 profile 跑的是构建产物，只改源码什么都不会变。每次改源码必须按序完成三步：

```sh
# 1. 重建产物（在 deepseek-harness 根目录）
node node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild \
  examples/csv-query-tool/src/index.ts --bundle --format=esm --platform=node \
  --external:@deepseek-ai/dsh-tools --external:@deepseek-ai/schemastery \
  --outfile=examples/csv-query-tool/bundle/index.js

# 2. bundle/package.json 里 bump 版本号（0.1.0 → 0.1.1），然后重装——
#    pnpm 的 file: 依赖是拷贝，不 remove + add 就一直是旧快照
pnpm dsh plugin --profile web remove dsh-csv-query-tool
pnpm dsh plugin --profile web add "dsh-csv-query-tool@file:$PWD/examples/csv-query-tool/bundle"

# 3. 重启 web 进程（HMR 发布版禁用）
taskkill //F //IM node.exe && pnpm dsh web
```

漏掉任何一步，profile 静默跑的都是旧版——上面的 config 端到端验证正好踩中（patch 改了但 profile 副本是旧的，`config:` 一直不出现，重装才生效）。版本号 bump 让「新旧」可见：dump-config 看 layer，profile 的 package.json 钉住安装的版本。

`dsh plugin add` 会把 bundle pnpm-link 进 profile，并因包声明了 `dsh.bundle` 而把它追加到 profile 的 `dsh.profile.bundles` 列表。bundle layer 按包名解析插件，所以不涉及 junction 或绝对路径——这是 `--patch`（本地临时）和 junction 相对路径（机器本地）都不具备的可移植分发路径。卸载用 `dsh plugin --profile web remove dsh-csv-query-tool`。

完整的 bundle 契约与 layer 顺序见[打包教程](../../docs/user/develop/basic/publish.md)。
