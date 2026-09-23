# 整体索引

本仓库三段内容的入口，以及各篇摘要与其上游原文的 hash 配对。三段的定位与目录结构见根 [README.md](../README.md)。

## 三段入口

| 段 | 里面有什么 |
| --- | --- |
| [01-learn-basics](../01-learn-basics/) · DSH 基础学习 | 自写摘要 + 官方材料副本 + 最小可运行示例 |
| [02-practice-app](../02-practice-app/) · DSH 应用练习 | surface 系列笔记 + 零依赖运行脚本 |
| [03-practice-plugin](../03-practice-plugin/) · DSH 插件练习 | 11 个实战源码 + 经验文章 + 官方手册副本 |

## 摘要目录

| 篇 | 讲什么 |
| --- | --- |
| [typescript-basics](../01-learn-basics/notes/typescript-basics.md) | TypeScript 与工程化：tsconfig / ESM / pnpm monorepo |
| [architecture-reading](../01-learn-basics/notes/architecture-reading.md) | 逐段精读 harness 架构文档：插件树 / 事件域 / 轮次流程 / 会话日志 |
| [cordis-tutorial/](../01-learn-basics/notes/cordis-tutorial/) | Cordis 教程跟学笔记，8 章，含 60 个实验（已实跑校验） |
| [cordis-basics](../01-learn-basics/notes/cordis-basics.md) | 插件模型入门：命令／工具／服务／effect |
| [adding-a-tool](../03-practice-plugin/notes/adding-a-tool.md) | 添加模型工具：工具 vs 命令、执行扩展点 |
| [plugin-config](../03-practice-plugin/notes/plugin-config.md) | 插件配置：Schemastery、同名导出、分层 |
| [plugin-package](../03-practice-plugin/notes/plugin-package.md) | 插件包布局、独立分发与官方安装通道 |
| [client-plugin](../03-practice-plugin/notes/client-plugin.md) | Client 插件（Web UI 侧） |

> 每篇对应的上游原文与 hash 配对见文末。官方一手材料都在 `sources/` 下：[01 段](../01-learn-basics/sources/)（Cordis 教程与架构）+ [03 段](../03-practice-plugin/sources/)（插件开发手册）。

## 实战与笔记

一个实战 = 一个源码目录 + 一篇笔记。**清单在段索引里，本页不重复：**

| 段 | 清单 |
| --- | --- |
| 插件练习 | [../03-practice-plugin/README.md](../03-practice-plugin/README.md) —— 11 个实战的序列表，外加 4 篇插件开发摘要 |
| 应用练习 | [../02-practice-app/README.md](../02-practice-app/README.md) —— surface 系列 5 篇笔记与运行脚本对照 |

两点容易踩的：

- `03-practice-plugin/examples/` 是**源码权威来源**，在本仓库不独立运行。测试、`--patch` 加载都要先拷进 deepseek-harness 的 `examples/<项目>/`，做法见根 [README.md](../README.md#验证方式)。
- `grill-send-button` 已提升为可独立安装的标准 bundle（`package.json` + `cordis.patch.yml`，走官方安装通道）；其余教学示例要分发，得先做同样提升，见 [plugin-package.md](../03-practice-plugin/notes/plugin-package.md)。

## 开发流程速记（helloworld / sql-check-tool 实战印证）

1. 写插件文件（`name` / `inject` / `apply` 三件套）。
2. 用 `--patch <file>.yml` 把插件行 insert 进 profile 的组合树。entry 的 `name` 相对**声明这一行的 patch 文件所在目录**解析（2026-09-17 实测；旧说法「锚定 profile 目录」只对 profile 目录里那份 `cordis.patch.yml` 成立）：所以 `examples/<项目>/` 下的 patch 直接写 `./src/...`，不需要 junction；profile 目录里那份才写 `./examples/...`，那份才需要 profile 下的 `examples` junction。写绝对路径时 Windows 要 `file:///D:/...` 前缀（裸 `E:/...` 会被当成 URL scheme `e:` 报错）。
3. **web 的 HMR 默认禁用**：加新插件必须重启 web 进程。
4. 测试：`pnpm exec vitest run --config examples/<项目>/vitest.examples.config.ts ... --disableConsoleIntercept --silent=false`（harness 的 vitest 工作区已不含 examples/，用随示例分发的临时配置；vitest 默认拦 console，调试要透传）。
5. 分发：把示例提升为**独立标准包**（`package.json` 声明 `dsh.bundle.patch` 与 `dsh.client`、自带 `cordis.patch.yml`、预构建 `lib/`、`files` 收口），经官方通道 `dsh plugin --profile web add <本地目录|git|npm|tarball>` 装进 profile（参数转发 pnpm + reconcile 只激活声明 `dsh.bundle` 的依赖），**重启 web 进程生效**。浏览器半边产物必须是 `window.__ModuleLoader__.load(...)` 工厂格式（裸 ESM 会整批加载失败）。机制见 [plugin-package.md](../03-practice-plugin/notes/plugin-package.md)。
6. 基础学习段的最小示例（`01-learn-basics/examples/`）不走上面这套：它们用 `vendor/cordis/bin.js` 跑，**先拷进 deepseek-harness 的 `tmp/`，再在实验自己目录里启动**（原因见 [examples/README.md](../01-learn-basics/examples/README.md)）。

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

`01-learn-basics/notes/*.md` 与 `03-practice-plugin/notes/*.md` 里的前几篇是自写的**学习摘要**，每篇对应一份上游原文（本仓库 `sources/` 或 deepseek-harness 源码）。上游更新时摘要可能漂移，为此记录各篇摘要与上游原文的 **git blob hash**。

重记方式（`git hash-object` 不依赖 git 仓库）：

```sh
cd xzz-dsh-plugin
git hash-object 01-learn-basics/notes/cordis-basics.md 01-learn-basics/sources/cordis-primer.zh.md ...
```

**「一致?」这一列读法**。`✓` 表示上游自上次核对后没动，摘要的结论仍然有效；`⚠️` 表示**上游已经更新**，摘要还没重读，结论可能已经过时（自己写的一侧改了但结论没变的不算）；`—` 表示上游文件已不在 harness 里。改完摘要后，把两侧 hash 一起重记，并把标记改回 `✓`。

同步记录：`sources/` 于 2026-09-23 对齐到 harness `c36a83ff6b`（`architecture`、`adding-a-package`、`adding-a-tool`、`cordis-primer` 与三章 cordis-tutorial 有更新；`basic/config.md` 未变；cookbook 的 `adding-a-conversation-node.zh.md` 上游已删除）。受影响的四篇摘要均已重读对齐。

| 摘要 | 上游原文 | 摘要 hash | 上游 hash | 一致? |
| --- | --- | --- | --- | --- |
| `01-learn-basics/notes/cordis-basics.md` | `01-learn-basics/sources/cordis-primer.zh.md` | 6889f67 | 3706173 | ✓ |
| `01-learn-basics/notes/architecture-reading.md` | `01-learn-basics/sources/architecture.zh.md`（同一个修订版的中文副本；带领阅读逐段引的是英文原本 `docs/architecture.md`，行号以那份为准） | 0f54c1a | 53125c0 | ✓ |
| `03-practice-plugin/notes/adding-a-tool.md` | `03-practice-plugin/sources/cookbook/adding-a-tool.zh.md` | 1662293 | 5ad488c | ✓ |
| `03-practice-plugin/notes/plugin-package.md` | `03-practice-plugin/sources/cookbook/adding-a-package.zh.md` | 9cef48f | 44a613b | ✓ |
| `03-practice-plugin/notes/plugin-config.md` | `03-practice-plugin/sources/basic/config.md`（deepseek-harness `docs/user/develop/basic/config.md` 双语副本） | bdcf399 | d935fc3 / 642a413 | ✓ |
| `03-practice-plugin/notes/client-plugin.md` | `03-practice-plugin/sources/cookbook/adding-a-conversation-node.zh.md`（部分，上游已删除）+ deepseek-harness `packages/client/AGENTS.md` | 7d58c2e | 2986f69 | — |

> `03-practice-plugin/notes/client-plugin.md` 还参考了 deepseek-harness 侧的 `packages/client/AGENTS.md`、`apps/web/`、`packages/client/modules/`、`packages/client/hmr/` 等；hash 只覆盖本仓库内的原文。摘要对 deepseek-harness 文件的引用更新时，修改本表备注。
>
> `03-practice-plugin/notes/plugin-package.md` 的独立分发语义另参考 deepseek-harness `docs/user/develop/basic/publish.md` 与 `apps/cli/src/plugin.ts`（源码位于 deepseek-harness，不在本仓库，hash 不配对）。
>
> 新增摘要时，在此登记一行并重记 hash。
