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

测试与调试（**都在 deepseek-harness 根目录执行**；先把本仓库 examples 同步过去）：

```sh
cp -r <本仓库>/examples/<项目> ../deepseek-harness/examples/<项目>  # 同步（权威源在本仓库）
pnpm exec vitest run examples/<项目>/tests/<项目>.spec.ts            # 跑测试
pnpm exec vitest run ... --disableConsoleIntercept --silent=false   # 透传 console 调试
pnpm dsh web --patch examples/<项目>/<项目>.patch.yml               # 临时挂进 web
```

分发为可安装 bundle 的完整验证流程见 `docs/plugin-package.md`（`pnpm run constraints && typecheck && lint` 等）。

## 核心心智模型

- **命令（command）vs 工具（tool）是两回事**：命令给人敲斜杠，经 `ctx.commands`，直接分派 handler、不经过模型、不烧 token；工具给模型调，经 `ctx.tools`，需要模型轮次。想让**用户**做确定的事用命令，想让**模型**扩展能力用工具。
- **插件最小三件套**：`export const name`（唯一）、`export const inject = ['services']`（依赖声明）、`export function apply(ctx)`（本体，`ctx.commands.register` / `ctx.tools.register` 等）。
- **注册即副作用**：Cordis 的 `register` 自动挂 disposer 到插件 fiber，插件卸载即撤销，不要手动清理。dsh 是热插拔的，漏清理会让注册越堆越乱。
- **依赖驱动加载**：`inject` 声明后 Cordis 等所有依赖服务就绪才调 `apply`。加载顺序由依赖决定，不是 yml 文件顺序。始终 PENDING 的插件通常缺服务提供方（如工具需要 `@deepseek-ai/dsh-system-prompt`）。
- 插件间**不互相 import**，只通过服务键（`ctx.<key>`）和类型化事件（`ctx.on(...)`）耦合。服务名是扁平全局命名空间，自定义服务要加前缀。
- 命令的 `rawInput` **包含分隔空白**（`/helloworld 小明` 的 rawInput 是 `" 小明"`），解析必须先 `trim()`。命令结果 `{ kind: 'success' | 'error', text }` 直接渲染 UI，不进模型历史。

## 环境特定坑（血泪经验）

- **patch entry 的 `name` 相对 profile 目录解析**（baseUrl 锚定 `~/.dsh/profiles/<profile>/`），不是 patch 文件位置；Windows 绝对路径必须 `file:///` 前缀（裸 `E:/...` 被当 URL scheme 报 `ERR_UNSUPPORTED_ESM_URL_SCHEME`）。免绝对路径三选一（细节见各 patch 文件头注释）：① profile 目录下建 junction（`mklink /J %USERPROFILE%\.dsh\profiles\web\examples <harness>\examples`，无需管理员）；② `DSH_HOME` 同盘写 `../../` 相对跳转；③ 升级 bundle 用 `dsh plugin add` 装包名。
- **web 的 HMR 发布时默认禁用**：加新插件必须重启 web 进程。界面没反应是正常现象，不是 bug。
- **vitest 默认拦截 console**：调试日志看不到不是没执行，加 `--disableConsoleIntercept --silent=false` 透传。

## 测试约定

- 哲学：**测试描述行为，不是正确性**——把「现在是这样工作的」钉死在测试里，包括框架的反直觉行为（如重复注册同名命令抛 `command "x" is already registered`、`admission misses log nothing`）。
- 装配模式（`tests/helloworld-command.spec.ts`）：mount **真实服务**（`SessionStore` / `CommandRuntime` / `AgentRegistry`），只 stub agent 本身；通过真实边界执行 `ctx.commands.execute(agent, line, signal)`（与 UI 适配器同一入口），**不要直接调 handler**。
- 若要验证插件挂载进真实 Loader 组合树（启动 `cordis.yml` 经 app bin），参照 deepseek-harness 源码 `examples/headless-agent/tests/` 的 `runLoaderSmoke` 模式（`packages/test-support/loader-smoke`）。
- 命令生命周期事件：`command/run`（执行前）与 `command/done`（结算时）记入接收 agent 的 session，payload 在 `event.data`；admission miss 什么都不记。

## 实战开发流程

**新实战必须按「探索 → 提案 → 开发」三步走，禁止直接动手写代码。**

1. **探索**：先进入探索模式（openspec-explore 立场），只读源码/文档、画图、捋思路，不写实现代码。目标是产出选题与形态的判断——对应官方哪份指引、练什么、验证方式是什么。
2. **提案**：探索有结论后，固化成**正式提案**再动手。提案至少包含选题依据（对应官方指引/教程章节）、实战形态（目录结构、插件角色、测试与验证方式）、风险与开放问题。本仓库未初始化 OpenSpec 时，提案写入 `docs/proposals/<日期>-<项目>.md`；初始化后走 OpenSpec change proposal。
3. **开发**：提案经确认后才写源码、测试、README、笔记，按系列惯例收尾并提交。

**提交/推送纪律**：commit 按逻辑单位一次一个（粒度照旧）；**推送不每次提交都做**，攒到一批（一个实战收尾或几次提交）再 `git push`。推送走 SSH（origin 已设为 `git@github.com:...`；沙箱下需要完整权限，因为 git/ssh 要以 pipe stdio 启动子进程）。

## 文档维护约定

- **整体索引在 [docs/README.md](docs/README.md)**：`docs/*.md` 摘要目录 + 摘要↔上游 hash 配对表 + 实战/开发流程速记/deepseek-harness 关键源码。根 `README.md` 只留定位、目录结构、验证方式、什么是 dsh、许可（不单列快速导航，实践列表并入目录结构）；新增 `docs/*.md` 摘要或编辑摘要/上游同步时，更新配对表并重记 hash。
- 本仓库 ↔ deepseek-harness 的对应关系在 `docs/README.md` 维护，新增 `reference/` 副本或 `examples/` 实战时更新。
- 双语 README（`README.md` / `README.zh.md`）保持同步，改完重记 `README.i18n.yaml` hash（根目录与 helloworld 目录保留，其他双语对不强制加）。
- `notes/<日期>-<项目>.md` 是学习心得精炼版，`examples/<项目>/README` 是源码使用说明；两者互补，勿重复维护。
- 实战组织方式固定为「一个源码目录（`examples/`）+ 一篇笔记（`notes/`）」。
- **笔记写作风格见 [docs/notes-writing-style.md](docs/notes-writing-style.md)**：写 `notes/` 笔记前先读（系列结构 + 正常表达为主、卡兹克味点缀 + 硬性规则 + 自检）。
- **README 写作风格见 [docs/readme-writing-style.md](docs/readme-writing-style.md)**：写/改 `examples/<项目>/README` 前先读（直觉先行 + 逻辑递进 + 深挖块 + 双语同步）。
- **定稿前通读**：README 和笔记写完，以普通读者身份通读一遍，检查不通顺处并评审修改（规则见两份风格文档的「定稿前通读 / 自检」）。

## 关键源码位置（deepseek-harness 内）

- `packages/interaction/commands/src/index.ts` — `ctx.commands` 服务实现（register/list/find/execute）
- `packages/core/tools/` — `ctx.tools` 工具注册表与 `defineTool`
- `packages/bundle/base/cordis.patch.yml` — dsh-base bundle 的插件组合（数百行，模板级参考）
- `vendor/cordis/` — Cordis 框架本体（vendored 源码）
- `docs/cookbook/` 与 `docs/user/develop/basic/` — 官方实操手册（adding-a-package / adding-a-tool / publish）