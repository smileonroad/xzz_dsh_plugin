# 整体索引

本仓库三段内容的入口，以及各篇摘要与其上游原文的 hash 配对。三段的定位与目录结构见根 [README.md](../README.md)。

## 快速导航

| 想找什么 | 去哪里 |
| --- | --- |
| 基础学习段总览 | [../01-learn-basics/](../01-learn-basics/) |
| 应用练习段总览 | [../02-practice-app/](../02-practice-app/) |
| 插件练习段总览 | [../03-practice-plugin/](../03-practice-plugin/) |
| TypeScript 与工程化基础（tsconfig / ESM / monorepo） | [../01-learn-basics/notes/typescript-basics.md](../01-learn-basics/notes/typescript-basics.md) |
| 插件模型入门（命令／工具／服务／effect） | [../01-learn-basics/notes/cordis-basics.md](../01-learn-basics/notes/cordis-basics.md) |
| 添加模型工具（工具 vs 命令、执行扩展点） | [../03-practice-plugin/notes/adding-a-tool.md](../03-practice-plugin/notes/adding-a-tool.md) |
| 插件包布局、独立分发包与官方安装通道 | [../03-practice-plugin/notes/plugin-package.md](../03-practice-plugin/notes/plugin-package.md) |
| 插件配置（Schemastery、同名导出、分层） | [../03-practice-plugin/notes/plugin-config.md](../03-practice-plugin/notes/plugin-config.md) |
| Client 插件（Web UI 侧） | [../03-practice-plugin/notes/client-plugin.md](../03-practice-plugin/notes/client-plugin.md) |
| 应用形态笔记（headless／acp／jsonrpc／web／schedule） | [../02-practice-app/notes/](../02-practice-app/notes/) |
| 实战源码 + 测试（11 个插件） | [../03-practice-plugin/examples/](../03-practice-plugin/examples/) |
| 应用运行脚本 | [../02-practice-app/scripts/](../02-practice-app/scripts/) |
| 官方一手教程／手册 | [../01-learn-basics/sources/](../01-learn-basics/sources/) + [../03-practice-plugin/sources/](../03-practice-plugin/sources/) |
| 关键源码位置（deepseek-harness 内） | 见下文 |

## 实战组织

一个实战 = 一个源码目录（`03-practice-plugin/examples/<项目>/`）+ 一篇经验笔记（`03-practice-plugin/notes/`）。应用侧的运行脚本在 `02-practice-app/scripts/`，与 `02-practice-app/notes/` 的应用笔记配套。

- `03-practice-plugin/examples/<项目>/` — 完整源码（可独立阅读、可作参考模板），也是**源码权威来源**。测试通过 `@deepseek-ai/dsh-*` 包与根 `tsconfig.json` 加载（`tsx`），须在 deepseek-harness 根目录运行——**验证前先把该目录拷贝到 deepseek-harness 的 `examples/<项目>/`**（覆盖，同名目录可能因旧内容而不同步），再在 deepseek-harness 根目录跑测试或在 web 中用 `--patch` 加载。`grill-send-button` 已升级为可独立安装的标准 bundle（`package.json` + `cordis.patch.yml`，官方通道安装，见 [plugin-package.md](../03-practice-plugin/notes/plugin-package.md)）；其余教学示例无 `package.json`，要分发需先做同样提升。
- `03-practice-plugin/notes/` — 对外发布的经验总结，面向对 dsh 插件开发感兴趣的读者；文章引用 `examples/` 下的源码作为参考。
- `02-practice-app/` — 换一个视角：不写插件，而是把 dsh 本身当应用跑起来（headless／acp／jsonrpc／web／schedule），笔记讲形态与坑，`scripts/` 放零依赖运行器。

**已发布系列（插件练习）：**

| 日期 | 主题 | 笔记 | 源码 |
| --- | --- | --- | --- |
| 2026-08-15 | `/helloworld` 命令插件实战：命令 vs 工具、三个坑、测试哲学 | [notes/2026-08-15-helloworld-command.md](../03-practice-plugin/notes/2026-08-15-helloworld-command.md) | [examples/helloworld-command/](../03-practice-plugin/examples/helloworld-command/) |
| 2026-08-16 | `sql_check` 工具插件实战：defineTool 契约、canonical value、presenters 纯函数、零依赖 node:sqlite | [notes/2026-08-16-sql-check-tool.md](../03-practice-plugin/notes/2026-08-16-sql-check-tool.md) | [examples/sql-check-tool/](../03-practice-plugin/examples/sql-check-tool/) |
| 2026-08-16 | `csv_query` 工具插件实战：Config schema、参数覆盖配置分层、手写 CSV 解析器、bundle 打包分发 | [notes/2026-08-16-csv-query-tool.md](../03-practice-plugin/notes/2026-08-16-csv-query-tool.md) | [examples/csv-query-tool/](../03-practice-plugin/examples/csv-query-tool/) |
| 2026-08-22 | `ctx.units` seam 实战：Definition/Provider/Consumer 三角色、服务键命名空间、inject 依赖驱动、config 换表 | [notes/2026-08-22-units-capability.md](../03-practice-plugin/notes/2026-08-22-units-capability.md) | [examples/units-capability/](../03-practice-plugin/examples/units-capability/) |
| 2026-08-23 | 事件实战：监听真实 harness 事件（tools 瀑布 + commands/change）、waterfall 观察者/决策者纪律、五种分发模式（serial/bail/parallel 用夹具） | [notes/2026-08-23-events-demo.md](../03-practice-plugin/notes/2026-08-23-events-demo.md) | [examples/events-demo/](../03-practice-plugin/examples/events-demo/) |
| 2026-08-24 | 自声明事件实战：奶茶店事件族（declare module + @mode 契约）、五种分发模式全自有声明（serial/bail/parallel 真实语义）、type-only import、事件派生 | [notes/2026-08-24-tea-shop-demo.md](../03-practice-plugin/notes/2026-08-24-tea-shop-demo.md) | [examples/tea-shop-demo/](../03-practice-plugin/examples/tea-shop-demo/) |
| 2026-08-26 | approval 应答者实战：传达室自动审批（allow/deny 名单 + prepend 层序）、approval/request 三角色与 fail-closed、审计对与会话策略 | [notes/2026-08-26-gatehouse-demo.md](../03-practice-plugin/notes/2026-08-26-gatehouse-demo.md) | [examples/gatehouse-demo/](../03-practice-plugin/examples/gatehouse-demo/) |
| 2026-09-02 | Client 对话节点实战：洗衣店卡片（可重放 session 事件 + Conversation Node Definition + keyed 聊天渲染器，纯投影测试） | [notes/2026-09-02-laundry-demo.md](../03-practice-plugin/notes/2026-09-02-laundry-demo.md) | [examples/laundry-demo/](../03-practice-plugin/examples/laundry-demo/) |
| 2026-09-07 | 纯 Client 插件实战：输入栏加按钮（list 槽新增 vs 替换、slots.inject、standard props 的 inputActions、busy 纯函数闸门、动态插件零重启验证；9-9 补记提升为独立标准包、官方通道装进 profile、`__ModuleLoader__` 产物坑） | [notes/2026-09-07-grill-send-button.md](../03-practice-plugin/notes/2026-09-07-grill-send-button.md) | [examples/grill-send-button/](../03-practice-plugin/examples/grill-send-button/) |
| 2026-09-09 | Client + Host 双端联动实战：💡 推荐开关与 LLM 追问胶囊（host.call↔harness.handle、readSession 取正文、session.running 边沿触发、reasoningEffort off、notOld/isJunkTip、26 版动态迭代） | [notes/2026-09-09-reply-tips.md](../03-practice-plugin/notes/2026-09-09-reply-tips.md) | [examples/reply-tips/](../03-practice-plugin/examples/reply-tips/) |
| 2026-09-17 | 模型提供方实战：离线模型适配器（LlmAdapter 只需实现 stream、规范分片流契约由包不变量强制、抛错被规范化成终态 finish、reasoning 能力在 stream 之前校验、注册与原子 replace）+ 敏感词拦截层（llm/stream 瀑布短路，不调模型也能回答） | [notes/2026-09-17-scripted-llm-adapter.md](../03-practice-plugin/notes/2026-09-17-scripted-llm-adapter.md) | [examples/scripted-llm-adapter/](../03-practice-plugin/examples/scripted-llm-adapter/) |

**已发布系列（应用练习，surface 系列）：**

| # | 形态 | 主题 | 笔记 | 运行脚本 |
| --- | --- | --- | --- | --- |
| 01 | headless | 一次性任务 CLI | [2026-08-21-headless-cli.md](../02-practice-app/notes/2026-08-21-headless-cli.md) | `scripts/run-headless.mjs` |
| 02 | acp | 宿主驱动的长会话 | [2026-08-21-acp.md](../02-practice-app/notes/2026-08-21-acp.md) | `scripts/acp-mini-client.mjs` |
| 03 | jsonrpc | SDK 极简协议 | [2026-09-02-jsonrpc-sdk-protocol.md](../02-practice-app/notes/2026-09-02-jsonrpc-sdk-protocol.md) | `scripts/jsonrpc-mini-client.mjs` |
| 04 | web | 浏览器 GUI | [2026-09-02-web-gui.md](../02-practice-app/notes/2026-09-02-web-gui.md) | `scripts/run-web.mjs` |
| 05 | schedule | 定时提醒能力 | [2026-09-02-schedule.md](../02-practice-app/notes/2026-09-02-schedule.md) | `scripts/run-schedule.mjs` |
| — | 汇总 | 同一个内核的五种打开方式 | [2026-09-02-surface-summary.md](../02-practice-app/notes/2026-09-02-surface-summary.md) | — |

## 开发流程速记（helloworld / sql-check-tool 实战印证）

1. 写插件文件（`name` / `inject` / `apply` 三件套）。
2. 用 `--patch <file>.yml` 把插件行 insert 进 profile 的组合树。entry 的 `name` 相对**声明这一行的 patch 文件所在目录**解析（2026-09-17 实测；旧说法「锚定 profile 目录」只对 profile 目录里那份 `cordis.patch.yml` 成立）：所以 `examples/<项目>/` 下的 patch 直接写 `./src/...`，不需要 junction；profile 目录里那份才写 `./examples/...`，那份才需要 profile 下的 `examples` junction。写绝对路径时 Windows 要 `file:///D:/...` 前缀（裸 `E:/...` 会被当成 URL scheme `e:` 报错）。
3. **web 的 HMR 默认禁用**：加新插件必须重启 web 进程。
4. 测试：`pnpm exec vitest run --config examples/<项目>/vitest.examples.config.ts ... --disableConsoleIntercept --silent=false`（harness 的 vitest 工作区已不含 examples/，用随示例分发的临时配置；vitest 默认拦 console，调试要透传）。
5. 分发：把示例提升为**独立标准包**（`package.json` 声明 `dsh.bundle.patch` 与 `dsh.client`、自带 `cordis.patch.yml`、预构建 `lib/`、`files` 收口），经官方通道 `dsh plugin --profile web add <本地目录|git|npm|tarball>` 装进 profile（参数转发 pnpm + reconcile 只激活声明 `dsh.bundle` 的依赖），**重启 web 进程生效**。浏览器半边产物必须是 `window.__ModuleLoader__.load(...)` 工厂格式（裸 ESM 会整批加载失败）。机制见 [plugin-package.md](../03-practice-plugin/notes/plugin-package.md)。

## 关键源码位置（deepseek-harness 内）

- `packages/interaction/commands/src/index.ts` — `ctx.commands` 服务实现（register/list/find/execute）
- `packages/core/tools/` — `ctx.tools` 工具注册表与 `defineTool`（含 presentCall/presentResult 纯投影、canonical value 契约）
- `packages/bundle/base/cordis.patch.yml` — dsh-base bundle 的插件组合（数百行配置）
- `vendor/cordis/` — Cordis 框架本体（vendored 源码）
- `docs/user/develop/basic/` — 「第一个 Harness 插件」系列教程（config / tool / publish）
- `docs/cookbook/` — 实操手册（adding-a-package / adding-a-tool / …）
- `apps/cli/src/plugin.ts` + `args.ts` — `dsh plugin add` 实现（pnpm 转发 + `dsh.profile.bundles` reconcile + 本地 spec 锚定）
- `vendor/loader/src/` — Cordis Loader（patch 行挂载、`exports.default ?? exports` 解包）
- `packages/client/modules/src/` — web client-modules：扫 loader 条目、组合 `__DSH_BOOT__`、浏览器产物要求 `__ModuleLoader__.load` 登记

## 摘要 ↔ 上游配对

`01-learn-basics/notes/*.md` 与 `03-practice-plugin/notes/*.md` 里的前五篇是自写的**学习摘要**，每篇对应一份上游原文（本仓库 `sources/` 或 deepseek-harness 源码）。上游更新时摘要可能漂移，为此记录各篇摘要与上游原文的 **git blob hash**：hash 对不上即说明其中一侧已变更。

重记方式（`git hash-object` 不依赖 git 仓库）：

```sh
cd xzz-dsh-plugin
git hash-object 01-learn-basics/notes/cordis-basics.md 01-learn-basics/sources/cordis-primer.zh.md ...
```

| 摘要 | 上游原文 | 摘要 hash | 上游 hash | 一致? |
| --- | --- | --- | --- | --- |
| `01-learn-basics/notes/cordis-basics.md` | `01-learn-basics/sources/cordis-primer.zh.md` | 7cf57c2 | 9990736 | ✓ |
| `03-practice-plugin/notes/adding-a-tool.md` | `03-practice-plugin/sources/cookbook/adding-a-tool.zh.md` | 60c09e0 | 6a24d5d | ✓ |
| `03-practice-plugin/notes/plugin-package.md` | `03-practice-plugin/sources/cookbook/adding-a-package.zh.md` | 5567010 | c6d0918 | ✓ |
| `03-practice-plugin/notes/plugin-config.md` | `03-practice-plugin/sources/basic/config.md`（deepseek-harness `docs/user/develop/basic/config.md` 双语副本） | 8fa986b | d935fc3 / 642a413 | ✓ |
| `03-practice-plugin/notes/client-plugin.md` | `03-practice-plugin/sources/cookbook/adding-a-conversation-node.zh.md`（部分）+ deepseek-harness `packages/client/AGENTS.md` | e65cf35 | 2986f69 | ✓ |

> `03-practice-plugin/notes/client-plugin.md` 还参考了 deepseek-harness 侧的 `packages/client/AGENTS.md`、`apps/web/`、`packages/client/modules/`、`packages/client/hmr/` 等；hash 只覆盖本仓库内的原文。摘要对 deepseek-harness 文件的引用更新时，修改本表备注。
>
> `03-practice-plugin/notes/plugin-package.md` 的独立分发语义另参考 deepseek-harness `docs/user/develop/basic/publish.md` 与 `apps/cli/src/plugin.ts`（源码位于 deepseek-harness，不在本仓库，hash 不配对）。
>
> 新增摘要时，在此登记一行并重记 hash。
