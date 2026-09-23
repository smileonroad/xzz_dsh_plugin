# 基础学习的可运行示例

这一段的 `examples/` 装**能跑的最小示例**，配合 `notes/` 里的笔记使用。

和 [03 段的实战](../../03-practice-plugin/examples/) 不是一回事。那边的每个目录是一个完整插件实战（带测试、带双语 README、可独立分发）；这边只求**把一个概念跑给你看**，一个目录通常就是一份 `cordis.yml` 加一两个插件文件。

## 目录

| 目录 | 配合哪篇笔记 | 状态 |
| --- | --- | --- |
| [`cordis-tutorial/`](cordis-tutorial/) | [notes/cordis-tutorial/](../notes/cordis-tutorial/) · Cordis 教程跟学笔记 | 框架已立，实验逐个补 |

## 怎么跑

本仓库不装依赖，示例都在 **deepseek-harness 检出目录里跑**（要 `tsx`，还要 `@deepseek-ai/*` 能被解析）。所以约定是两条：

- **权威源在本仓库**（就是这里），可阅读、可 diff、有历史。
- **要跑，先拷进 harness 的临时目录**。harness 的 `.gitignore` 里有 `tmp/`，拷进去不会污染它的工作区。

```sh
H=/d/myPI/deepseek-harness
cd <本仓库>/01-learn-basics/examples
cp -r cordis-tutorial "$H/tmp/cordis-tutorial"
cd "$H/tmp/cordis-tutorial/<实验目录>"
node --import tsx ../../../vendor/cordis/bin.js
```

`../../../` 是从实验目录回到 harness 根（`<实验目录>` → `cordis-tutorial` → `tmp` → 仓库根）。

**为什么必须在实验自己的目录里启动**。`vendor/cordis/bin.js` 把 `ctx.baseUrl` 设成**当前工作目录**，而 `cordis.yml` 里的 `./xxx.ts` 是相对 `baseUrl` 解析的。站在 harness 根目录跑，它会去找 `./cordis.yml` 而找不到。
