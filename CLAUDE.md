# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 仓库定位

本仓库是 **dsh（DeepSeek Harness）的学习与实践记录**，不是 dsh 本体源码。内容按「先懂、再用、再写」排成三段，外加一个元信息目录：

- `01-learn-basics/` — DSH 基础学习。`notes/` 自写摘要、`sources/` 官方材料副本（**只读**，勿编辑）、`examples/` 最小可运行示例。
- `02-practice-app/` — DSH 应用练习。`notes/` 应用形态笔记、`scripts/` 零依赖运行器与 cordis 配置、`sources/` 应用侧材料。
- `03-practice-plugin/` — DSH 插件练习。`examples/` 实战源码（每目录可独立下载，含测试）、`notes/` 对外发布的经验笔记、`sources/` 官方插件手册副本。
- `meta/` — 仓库元信息（摘要↔上游配对 `upstream-pairing.md`、写作规范、`proposals/` 提案），不属于任何一段。

三段内部用同一套词汇。**`notes/` 是自己写的，`sources/` 是别人写的，`examples/`（或 `scripts/`）是能跑的。**

**本仓库是 deepseek-harness 源码的子集/镜像，`03-practice-plugin/examples` 是源码权威来源**：

- 本仓库的 `03-practice-plugin/examples/<项目>/` 是插件源码的权威来源。要运行，把它**拷贝到 deepseek-harness 源码的 `examples/<项目>/`**（覆盖；同名目录可能因旧内容而不同步），再在 deepseek-harness 根目录跑测试或 `--patch` 加载。拷贝后目录内的相对引用不受影响（它们相对自身解析）。
- 测试必须在 deepseek-harness 根目录运行（依赖 `@deepseek-ai/dsh-*` 包、`tsconfig.json`、`tsx`）。
- 本仓库 ↔ deepseek-harness 的对应关系见 `meta/upstream-pairing.md`；新增 `sources/` 副本或 `examples/` 实战时要同步更新。

## 常用命令

测试与调试（**都在 deepseek-harness 根目录执行**；先把本仓库 examples 同步过去）：

```sh
cp -r <本仓库>/03-practice-plugin/examples/<项目> ../deepseek-harness/examples/<项目>  # 同步（权威源在本仓库）
pnpm exec vitest run examples/<项目>/tests/<项目>.spec.ts            # 跑测试
pnpm exec vitest run ... --disableConsoleIntercept --silent=false   # 透传 console 调试
pnpm dsh web --patch examples/<项目>/<项目>.patch.yml               # 临时挂进 web
```

分发为可安装 bundle 的完整验证流程见 `03-practice-plugin/notes/plugin-package.md`（`pnpm run constraints && typecheck && lint` 等）。

## 核心心智模型

- **命令（command）vs 工具（tool）是两回事**：命令给人敲斜杠，经 `ctx.commands`，直接分派 handler、不经过模型、不烧 token；工具给模型调，经 `ctx.tools`，需要模型轮次。想让**用户**做确定的事用命令，想让**模型**扩展能力用工具。
- **插件最小三件套**：`export const name`（唯一）、`export const inject = ['services']`（依赖声明）、`export function apply(ctx)`（本体，`ctx.commands.register` / `ctx.tools.register` 等）。
- **注册即副作用**：Cordis 的 `register` 自动挂 disposer 到插件 fiber，插件卸载即撤销，不要手动清理。dsh 是热插拔的，漏清理会让注册越堆越乱。
- **依赖驱动加载**：`inject` 声明后 Cordis 等所有依赖服务就绪才调 `apply`。加载顺序由依赖决定，不是 yml 文件顺序。始终 PENDING 的插件通常缺服务提供方（如工具需要 `@deepseek-ai/dsh-system-prompt`）。
- 插件间**不互相 import**，只通过服务键（`ctx.<key>`）和类型化事件（`ctx.on(...)`）耦合。服务名是扁平全局命名空间，自定义服务要加前缀。
- 命令的 `rawInput` **包含分隔空白**（`/helloworld 小明` 的 rawInput 是 `" 小明"`），解析必须先 `trim()`。命令结果 `{ kind: 'success' | 'error', text }` 直接渲染 UI，不进模型历史。

## 环境特定坑（血泪经验）

- **patch entry 的 `name` 相对「声明这一行的 patch 文件所在目录」解析**（2026-09-17 实测：`--patch examples/<项目>/<项目>.patch.yml` 里写 `./examples/<项目>/src/index.ts` 会解析成 `<项目目录>/examples/<项目>/src/index.ts` 而报 `failed to import`）。所以 `examples/<项目>/<项目>.patch.yml` 直接写 `./src/index.ts`，**不需要 junction**；只有 profile 目录里那份 `cordis.patch.yml` 才按 profile 目录解析，那一份写 `./examples/<项目>/...` 时才需要 profile 下的 `examples` junction（`mklink /J %USERPROFILE%\.dsh\profiles\web\examples <harness>\examples`，无需管理员）。Windows 绝对路径必须 `file:///` 前缀（裸 `E:/...` 被当 URL scheme 报 `ERR_UNSUPPORTED_ESM_URL_SCHEME`）；`DSH_HOME` 同盘时也可写 `../../` 相对跳转；升级 bundle 用 `dsh plugin add` 装包名。
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
2. **提案**：探索有结论后，固化成**正式提案**再动手。提案至少包含选题依据（对应官方指引/教程章节）、实战形态（目录结构、插件角色、测试与验证方式）、风险与开放问题。本仓库未初始化 OpenSpec 时，提案写入 `meta/proposals/<日期>-<项目>.md`；初始化后走 OpenSpec change proposal。
3. **开发**：提案经确认后才写源码、测试、README、笔记，按系列惯例收尾并提交。

**提交/推送纪律**：commit 按逻辑单位一次一个（粒度照旧）；**推送不每次提交都做**，攒到一批（一个实战收尾或几次提交）再 `git push`。推送走 SSH（origin 已设为 `git@github.com:...`；沙箱下需要完整权限，因为 git/ssh 要以 pipe stdio 启动子进程）。

## 文档维护约定

- **不设全仓「整体索引」**。入口在根 `README.md`（定位、目录结构、验证方式、什么是 dsh、许可）；每段的内容清单在各段 `README.md`；`meta/` 只放别处没有的东西 —— 摘要↔上游配对表（[upstream-pairing.md](meta/upstream-pairing.md)）、写作规范、提案。新增摘要或同步上游时，更新配对表并重记 hash。
- **命名规范**（三段同形，2026-09-23 定）：段目录 `NN-<slug>/`（`learn-` 学习段、`practice-` 练习段）；段内必有 `README.md`，`notes/` 与 `examples/`（或 `scripts/`）必建，`sources/` 有材料才建。`notes/` 分三类：**学习摘要**按主题命名（`<topic>.md`，如 `cordis-basics.md`、`typescript-basics.md`），上游配对记进 `meta/upstream-pairing.md`；**实战笔记**用 `YYYY-MM-DD-<slug>.md`，slug 与 `examples/` 项目名一致；**系列笔记**是一个目录（`<topic>/README.md` 作总览 + 分章文件，如 `cordis-tutorial/`）。`sources/` **保持上游原文件名与相对路径**，只读。实战目录必带 `README.md` / `README.zh.md` / `README.i18n.yaml` / `src/` / `tests/<slug>.spec.ts` / `vitest.examples.config.ts` / `LICENSE`；教学示例 patch 叫 `<slug>.patch.yml`，标准 bundle 才叫 `cordis.patch.yml`（名字被 `package.json` 的 `dsh.bundle.patch` 锁定）。
- 本仓库 ↔ deepseek-harness 的对应关系在 `meta/upstream-pairing.md` 维护，新增 `sources/` 副本或 `examples/` 实战时更新。
- 双语 README（根 `README.md` / `README.zh.md`，以及各实战目录）保持同步，改完重记对应 `README.i18n.yaml` 的 hash（根目录与 helloworld 目录保留，其他双语对不强制加）。
- `03-practice-plugin/notes/<日期>-<项目>.md` 是学习心得精炼版，`03-practice-plugin/examples/<项目>/README` 是源码使用说明；两者互补，勿重复维护。
- 实战组织方式固定为「一个源码目录（`03-practice-plugin/examples/`）+ 一篇笔记（`03-practice-plugin/notes/`）」。
- **笔记写作风格见 [meta/notes-writing-style.md](meta/notes-writing-style.md)**：写 `notes/` 笔记前先读（系列结构 + 正常表达为主、卡兹克味点缀 + 硬性规则 + 自检）。
- **README 写作风格见 [meta/readme-writing-style.md](meta/readme-writing-style.md)**：写/改 `examples/<项目>/README` 前先读（直觉先行 + 逻辑递进 + 深挖块 + 双语同步）。
- **定稿前通读**：README 和笔记写完，以普通读者身份通读一遍，检查不通顺处并评审修改（规则见两份风格文档的「定稿前通读 / 自检」）。

## 关键源码位置（deepseek-harness 内）

- `packages/interaction/commands/src/index.ts` — `ctx.commands` 服务实现（register/list/find/execute）
- `packages/core/tools/` — `ctx.tools` 工具注册表与 `defineTool`
- `packages/bundle/base/cordis.patch.yml` — dsh-base bundle 的插件组合（数百行，模板级参考）
- `vendor/cordis/` — Cordis 框架本体（vendored 源码）
- `docs/cookbook/` 与 `docs/user/develop/basic/` — 官方实操手册（adding-a-package / adding-a-tool / publish）