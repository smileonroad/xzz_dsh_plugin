# 整体索引

本仓库各层的内容入口，以及 `docs/*.md` 摘要与其上游原文的 hash 配对。

## 快速导航

| 想找什么                                 | 去哪里                                                       |
| ---------------------------------------- | ------------------------------------------------------------ |
| 插件模型入门（命令/工具/服务/effect）    | [cordis-basics.md](cordis-basics.md)                         |
| dsh 插件包布局与分发（packages/ 规范）   | [plugin-package.md](plugin-package.md)                       |
| 添加模型工具（工具 vs 命令、执行扩展点） | [adding-a-tool.md](adding-a-tool.md)                         |
| 插件配置（Schemastery、同名导出、分层）  | [plugin-config.md](plugin-config.md)                         |
| Client 插件（Web UI 侧）                 | [client-plugin.md](client-plugin.md)                         |
| 实战源码 + 测试（含装配模式）            | [../examples/helloworld-command/](../examples/helloworld-command/) / [../examples/sql-check-tool/](../examples/sql-check-tool/) / [../examples/csv-query-tool/](../examples/csv-query-tool/) |
| 经验笔记（对外文章，含坑与测试哲学）     | [../notes/2026-08-15-helloworld-command.md](../notes/2026-08-15-helloworld-command.md) / [../notes/2026-08-16-sql-check-tool.md](../notes/2026-08-16-sql-check-tool.md) / [../notes/2026-08-16-csv-query-tool.md](../notes/2026-08-16-csv-query-tool.md) |
| 官方一手教程/手册                        | [../reference/](../reference/)                               |
| 关键源码位置（deepseek-harness 内）      | 见下文                                                       |

## 实战组织

一个实战 = 一个源码目录（`examples/<项目>/`）+ 一篇经验笔记（`notes/`）。

- `examples/<项目>/` — 完整源码（可独立阅读、可作参考模板），也是**源码权威来源**。测试通过 `@deepseek-ai/dsh-*` 包与根 `tsconfig.json` 加载（`tsx`），须在 deepseek-harness 根目录运行——**验证前先把该目录拷贝到 deepseek-harness 的 `examples/<项目>/`**（覆盖，同名目录可能因旧内容而不同步），再在 deepseek-harness 根目录跑测试或在 web 中用 `--patch` 加载。教学示例无 `package.json`，要分发需提升为标准 bundle。
- `notes/` — 对外发布的经验总结，面向对 dsh 插件开发感兴趣的读者；文章引用 `examples/` 下的源码作为参考。

**已发布系列：**

| 日期       | 主题                                                       | 笔记                                                         | 源码                                                         |
| ---------- | ---------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| 2026-08-15 | `/helloworld` 命令插件实战：命令 vs 工具、三个坑、测试哲学 | [notes/2026-08-15-helloworld-command.md](../notes/2026-08-15-helloworld-command.md) | [examples/helloworld-command/](../examples/helloworld-command/) |
| 2026-08-16 | `sql_check` 工具插件实战：defineTool 契约、canonical value、presenters 纯函数、零依赖 node:sqlite | [notes/2026-08-16-sql-check-tool.md](../notes/2026-08-16-sql-check-tool.md) | [examples/sql-check-tool/](../examples/sql-check-tool/)       |
| 2026-08-18 | `csv_query` 工具插件实战：Config schema、参数覆盖配置分层、手写 CSV 解析器、bundle 打包分发 | [notes/2026-08-16-csv-query-tool.md](../notes/2026-08-16-csv-query-tool.md) | [examples/csv-query-tool/](../examples/csv-query-tool/)       |

## 开发流程速记（helloworld / sql-check-tool 实战印证）

1. 写插件文件（`name` / `inject` / `apply` 三件套）。
2. 用 `--patch <file>.yml` 把插件行 insert 进 profile 的组合树。entry 的 `name` 相对 profile 目录（`~/.dsh/profiles/<profile>/`）解析，不是 patch 文件位置：免绝对路径的做法是 profile 目录下建 junction 指向 deepseek-harness 后写 `./examples/...`（本仓库 patch 默认如此），或设 `DSH_HOME` 同盘写 `../../` 跳转；写绝对路径时 Windows 要 `file:///D:/...` 前缀（裸 `E:/...` 会被当成 URL scheme `e:` 报错）。
3. **web 的 HMR 默认禁用**：加新插件必须重启 web 进程。
4. 测试：`pnpm exec vitest run ... --disableConsoleIntercept --silent=false`（vitest 默认拦 console，调试要透传）。
5. 分发：升级为 `packages/` 下的标准 bundle（带 `dsh.bundle.patch`），`dsh plugin --profile <name> add ...` 安装。

## 关键源码位置（deepseek-harness 内）

- `packages/interaction/commands/src/index.ts` — `ctx.commands` 服务实现（register/list/find/execute）
- `packages/core/tools/` — `ctx.tools` 工具注册表与 `defineTool`（含 presentCall/presentResult 纯投影、canonical value 契约）
- `packages/bundle/base/cordis.patch.yml` — dsh-base bundle 的插件组合（数百行配置）
- `vendor/cordis/` — Cordis 框架本体（vendored 源码）
- `docs/user/develop/basic/` — 「第一个 Harness 插件」系列教程（config / tool / publish）
- `docs/cookbook/` — 实操手册（adding-a-package / adding-a-tool / …）

## 摘要 ↔ 上游配对

`docs/*.md` 是自写的**学习摘要**，每篇对应一份上游原文（本仓库 `reference/` 或 deepseek-harness 源码）。上游更新时摘要可能漂移，为此记录各篇摘要与上游原文的 **git blob hash**：hash 对不上即说明其中一侧已变更。

重记方式（`git hash-object` 不依赖 git 仓库）：

```sh
cd xzz-dsh-plugin
git hash-object docs/cordis-basics.md reference/cordis-primer.zh.md ...
```

| 摘要                     | 上游原文                                                     | 摘要 hash | 上游 hash | 一致? |
| ------------------------ | ------------------------------------------------------------ | --------- | --------- | ----- |
| `docs/cordis-basics.md`  | `reference/cordis-primer.zh.md`                              | 7cf57c2   | d4d60f6   | ✓     |
| `docs/adding-a-tool.md`  | `reference/cookbook/adding-a-tool.zh.md`                     | 60c09e0   | 27a90ce   | ✓     |
| `docs/plugin-package.md` | `reference/cookbook/adding-a-package.zh.md`                  | c8e77c0   | b7a7492   | ✓     |
| `docs/plugin-config.md` | `reference/basic/config.md`（deepseek-harness `docs/user/develop/basic/config.md` 双语副本） | 8fa986b | 21ba39f / a882c4d | ✓     |
| `docs/client-plugin.md`  | `reference/cookbook/adding-a-conversation-node.zh.md`（部分）+ deepseek-harness `packages/client/AGENTS.md` | 6fc508e   | 92445e1   | ✓     |

> `docs/client-plugin.md` 还参考了 deepseek-harness 侧的 `packages/client/AGENTS.md`、`apps/web/`、`packages/client/modules/`、`packages/client/hmr/` 等；hash 只覆盖本仓库内的原文。摘要对 deepseek-harness 文件的引用更新时，修改本表备注。
>
> 新增 `docs/*.md` 摘要时，在此登记一行并重记 hash。