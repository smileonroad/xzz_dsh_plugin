# cordis-tutorial 实验

配合 [Cordis 教程跟学笔记](../../notes/cordis-tutorial/) 的实验源码。**权威源在这里**；要跑，先拷进 deepseek-harness 的 `tmp/`（见 [../README.md](../README.md)）。

## 状态

## 状态

**框架已立，实验目录逐个补。**

当前 **131 个文件**。两类来源：

- **文档代码块** —— 正文写过内容的每一行都逐字照搬；
- **`cordis.yml`** —— 挂哪些插件由各目录的 `.ts` 和正文的运行命令确定，按代码补全（不是反推正文叙述）。

### 补全件（20 个代码文件）

文档没给这些文件的内容，按**正文描述 + 同模块／相邻实验的源码**补出。**每份文件首行都带「补全件」标记，不要当文档原文看。**（`05-schema-shape` 已拿到真源码，不在其中。）

| 目录 | 补全的文件 | 依据 |
| --- | --- | --- |
| `05-config-class-module` | `cfg-class-module.ts` | 对照 `05-config-class-static/cfg-class-static.ts`；日志文案取自 5.4 的输出 |
| `05-config-none` | `no-config.ts` | 5.4 「完全没有 `Config` 的类插件」+ 输出文案 |
| `05-default-export` | `default-fn.ts` | 第 1 章 Q4 给的模块级导出与输出 |
| `05-js-tag`、`05-js-tag-id` | `js-tag-demo.ts` | 5.7 「普通插件，`greeting` 默认 `'Hello'`，`apply` 打印 `${greeting}, ${target}!`」 |
| `06-entry-id` | `a.ts`、`b.ts` | 输出里的 `alpha 加载` / `beta 加载` |
| `06-disabled` | `report.ts`、`run.sh` | 6.1 「在 1 秒和 13 秒各打印一次所有 fiber 状态」；`run.sh` 的行为正文写了 |
| `06-group` | `x.ts`、`y.ts`、`run.sh` | 6.1 「各自在挂载和卸载时打印一行」（卸载用 `ctx.effect` 的 disposer） |
| `06-hmr` | `run.sh` | 6.3 给了三条命令行，包成脚本 |
| `06-hmr-config-error`、`06-hmr-reload-error` | `hello.ts` | 输出里的 `hello is ACTIVE` |
| `06-inject-why` | `dynamic.ts`、`orphan.ts`、`run.sh` | 第 3 章 3.3 给了时间线和 `run.sh` 的行为；`orphan.ts` 按输出反推 |
| `06-pending-fixed` | `dump-all.ts` | 6.4 「把所有 fiber 的名字和状态都打出来（不过滤）」+ 输出格式 |
| `06-duplicate-service` | `dump-all.ts` | 同上（拷贝） |

> 第 1–4 章、第 7–8 章的实验源码**无补全件**，全部来自文档代码块。
>
> 作者把真源码发来后，逐个替换 —— 标记行也一并去掉。

- 每个实验验哪一条、归哪一章：见笔记总览的[实验目录](../../notes/cordis-tutorial/README.md#实验目录)一节，那里是唯一清单，不在这里重复。
- 笔记里每个 🧪 验证实验块会给出该实验的文件内容与运行命令，补实验时按它落盘即可。

## 每个实验的形状

```
<实验目录>/
├── cordis.yml      # 组合配置，通常是 - insert: [{ id, name: './xxx.ts' }]
└── xxx.ts          # 一个或多个插件文件（name / inject / apply）
```

一个目录只验一件事，所以普遍很短。名字与笔记里的目录名一一对应（`01-first-plugin`、`05-config-invalid`、`08-policy-chain` …）。

## 跑

```sh
H=/d/myPI/deepseek-harness
cd "$H/tmp/cordis-tutorial/<实验目录>"
node --import tsx ../../../vendor/cordis/bin.js
```

拷过来之后，在每个实验自己的目录里启动 —— 原因见 [../README.md](../README.md) 的「怎么跑」。
