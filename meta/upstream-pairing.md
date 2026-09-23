# 摘要 ↔ 上游配对

自写的**学习摘要**每篇对应一份上游原文（本仓库 `sources/` 或 deepseek-harness 源码）。上游更新时摘要可能漂移，为此记录两侧的 **git blob hash**。

这里只放这张表。三段的入口见各段 README，开发流程速记与关键源码位置见 `CLAUDE.md`。

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
| `03-practice-plugin/notes/plugin-package.md` | `03-practice-plugin/sources/cookbook/adding-a-package.zh.md` | 70f223d | 44a613b | ✓ |
| `03-practice-plugin/notes/plugin-config.md` | `03-practice-plugin/sources/basic/config.md`（deepseek-harness `docs/user/develop/basic/config.md` 双语副本） | bdcf399 | d935fc3 / 642a413 | ✓ |
| `03-practice-plugin/notes/client-plugin.md` | `03-practice-plugin/sources/cookbook/adding-a-conversation-node.zh.md`（部分，上游已删除）+ deepseek-harness `packages/client/AGENTS.md` | 7d58c2e | 2986f69 | — |

> `03-practice-plugin/notes/client-plugin.md` 还参考了 deepseek-harness 侧的 `packages/client/AGENTS.md`、`apps/web/`、`packages/client/modules/`、`packages/client/hmr/` 等；hash 只覆盖本仓库内的原文。摘要对 deepseek-harness 文件的引用更新时，修改本表备注。
>
> `03-practice-plugin/notes/plugin-package.md` 的独立分发语义另参考 deepseek-harness `docs/user/develop/basic/publish.md` 与 `apps/cli/src/plugin.ts`（源码位于 deepseek-harness，不在本仓库，hash 不配对）。
>
> 新增摘要时，在此登记一行并重记 hash。
