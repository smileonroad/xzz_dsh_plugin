# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 仓库定位

本仓库是 **dsh（DeepSeek Harness）插件开发的学习与实践记录**，不是 dsh 本体源码。它由三部分组成：

- `docs/` — 自写学习摘要（对官方文档的提炼，新内容先写到这里）
- `reference/` — 上游官方材料副本（**只读**，勿编辑，内容来自 deepseek-harness 源码）
- `notes/` — 对外发布的经验笔记（每篇对应一个 `examples/` 实战）
- `examples/` — 实战源码，每个目录可独立下载（含测试）

**本仓库是 deepseek-harness 源码的子集/镜像，examples 是源码权威来源**：

- 本仓库的 `examples/<项目>/` 是插件源码的权威来源。要运行，把它**拷贝到 deepseek-harness 源码的 `examples/<项目>/`**（覆盖；同名目录可能因旧内容而不同步），再在 deepseek-harness 根目录跑测试或 `--patch` 加载。
- 测试必须在 deepseek-harness 根目录运行（依赖 `@deepseek-ai/dsh-*` 包、`tsconfig.json`、`tsx`）。
- 本仓库 ↔ deepseek-harness 的对应关系见 `docs/README.md`；新增 reference 副本或 examples 时要同步更新。

## 常用命令

测试与调试（**都在 deepseek-harness 根目录执行**）。先把本仓库的 examples 同步到 deepseek-harness（示例以 helloworld 为例；更多例子的步骤见各自 `examples/<项目>/README`）：

```sh
cd ../deepseek-harness
# 同步 examples（拷贝本仓库的权威源码到 deepseek-harness，覆盖旧内容）
cp -r <本仓库>/examples/helloworld-command examples/helloworld-command

# 跑单个测试文件
pnpm exec vitest run examples/helloworld-command/tests/helloworld-command.spec.ts

# 调试时透传 console 输出（vitest 默认拦截 console，看不到 console.log）
pnpm exec vitest run examples/helloworld-command/tests/helloworld-command.spec.ts --disableConsoleIntercept --silent=false
```

把插件挂进 web profile（临时，用 patch 层）：

```sh
cd ../deepseek-harness
pnpm dsh web --patch examples/helloworld-command/helloworld.patch.yml
```

分发为可安装 bundle 的完整验证流程见 `docs/plugin-package.md`（`pnpm run constraints && pnpm run typecheck && pnpm run lint` 等）。

## 核心心智模型

- **命令（command）vs 工具（tool）是两回事**：命令给人敲斜杠，经 `ctx.commands`，直接分派 handler、不经过模型、不烧 token；工具给模型调，经 `ctx.tools`，需要模型轮次。想让**用户**做确定的事用命令，想让**模型**扩展能力用工具。
- **插件最小三件套**：`export const name`（唯一）、`export const inject = ['services']`（依赖声明）、`export function apply(ctx)`（本体，`ctx.commands.register` / `ctx.tools.register` 等）。
- **注册即副作用**：Cordis 的 `register` 自动挂 disposer 到插件 fiber，插件卸载即撤销，不要手动清理。dsh 是热插拔的，漏清理会让注册越堆越乱。
- **依赖驱动加载**：`inject` 声明后 Cordis 等所有依赖服务就绪才调 `apply`。加载顺序由依赖决定，不是 yml 文件顺序。始终 PENDING 的插件通常缺服务提供方（如工具需要 `@deepseek-ai/dsh-system-prompt`）。
- 插件间**不互相 import**，只通过服务键（`ctx.<key>`）和类型化事件（`ctx.on(...)`）耦合。服务名是扁平全局命名空间，自定义服务要加前缀。
- 命令的 `rawInput` **包含分隔空白**（`/helloworld 小明` 的 rawInput 是 `" 小明"`），解析必须先 `trim()`。命令结果 `{ kind: 'success' | 'error', text }` 直接渲染 UI，不进模型历史。

## 环境特定坑（血泪经验）

- **Windows 绝对路径必须 `file:///` 前缀**：patch 里 `name: 'E:/workspace/...'` 会把 `E:` 当成 URL scheme 报 `ERR_UNSUPPORTED_ESM_URL_SCHEME`，必须写 `file:///E:/workspace/...`。
- **patch 里 entry 的 `name` 只能相对 profile 目录或写绝对 `file:///` URL**：Loader 的 baseUrl 锚定在 `~/.dsh/profiles/<profile>/`（bundle 插件依赖装在那里），`./src/index.ts` 会解析成 `~/.dsh/profiles/<profile>/src/index.ts`，报 `ERR_MODULE_NOT_FOUND`。免绝对路径的三种做法（已验证）：① profile 目录下建 junction 指向 deepseek-harness（`mklink /J %USERPROFILE%\.dsh\profiles\web\examples <harness>\examples`，patch 写 `./examples/...`，无需管理员权限）；② 设 `DSH_HOME` 到与源码同盘，写 `../../` 相对跳转；③ 升级成 bundle 用 `dsh plugin add` 装，`name` 写包名。规则见 `vendor/loader/src/config/tree.ts` 的 `import()` 与 patch 文件内注释。
- **web 的 HMR 发布时默认禁用**：改 patch 文件不会自动生效，**加新插件必须重启 web 进程**。界面没反应是正常现象，不是 bug。
- **vitest 默认拦截 console**：调试日志看不到不是没执行，加 `--disableConsoleIntercept --silent=false` 透传。

## 测试约定

- 哲学：**测试描述行为，不是正确性**——把「现在是这样工作的」钉死在测试里，包括框架的反直觉行为（如重复注册同名命令抛 `command "x" is already registered`、`admission misses log nothing`）。
- 装配模式（`tests/helloworld-command.spec.ts`）：mount **真实服务**（`SessionStore` / `CommandRuntime` / `AgentRegistry`），只 stub agent 本身；通过真实边界执行 `ctx.commands.execute(agent, line, signal)`（与 UI 适配器同一入口），**不要直接调 handler**。
- 若要验证插件挂载进真实 Loader 组合树（启动 `cordis.yml` 经 app bin），参照 deepseek-harness 源码 `examples/headless-agent/tests/` 的 `runLoaderSmoke` 模式（`packages/test-support/loader-smoke`）。本仓库早期有 `web-load.spec.ts` + `fixtures/helloworld-driver.ts` 作为该模式的教学副本，但在本仓库（Windows）跑不过，已删除；README 保留了指路说明。
- 命令生命周期事件：`command/run`（执行前）与 `command/done`（结算时）记入接收 agent 的 session，payload 在 `event.data`；admission miss 什么都不记。

## 文档维护约定

- **整体索引在 [docs/README.md](docs/README.md)**：`docs/*.md` 摘要目录 + 摘要↔上游 hash 配对表 + 实战/开发流程速记/deepseek-harness 关键源码。根 `README.md` 只留定位、目录结构、快速导航、验证方式、什么是 dsh、许可；新增 `docs/*.md` 摘要或编辑摘要/上游同步时，更新配对表并重记 hash。
- 本仓库 ↔ deepseek-harness 的对应关系在 `docs/README.md` 维护，新增 `reference/` 副本或 `examples/` 实战时更新。
- 双语 README（`README.md` / `README.zh.md`）要保持同步，但本仓库**不跑** dsh 的 `verify-translation-pairing` 门禁；`README.i18n.yaml` 在根目录与 helloworld 目录里保留（后续 git 提交会校验配对），其他双语对不强制加 `.i18n.yaml`。
- `notes/<日期>-<项目>.md` 是学习心得精炼版，`examples/<项目>/README` 是源码使用说明；两者互补，勿重复维护。
- 实战组织方式固定为「一个源码目录（`examples/`）+ 一篇笔记（`notes/`）」。

## 关键源码位置（deepseek-harness 内）

- `packages/interaction/commands/src/index.ts` — `ctx.commands` 服务实现（register/list/find/execute）
- `packages/core/tools/` — `ctx.tools` 工具注册表与 `defineTool`
- `packages/bundle/base/cordis.patch.yml` — dsh-base bundle 的插件组合（数百行，模板级参考）
- `vendor/cordis/` — Cordis 框架本体（vendored 源码）
- `docs/cookbook/` 与 `docs/user/develop/basic/` — 官方实操手册（adding-a-package / adding-a-tool / publish）