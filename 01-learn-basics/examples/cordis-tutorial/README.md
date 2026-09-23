# cordis-tutorial 实验

配合 [Cordis 教程跟学笔记](../../notes/cordis-tutorial/) 的实验源码。**权威源在这里**；要跑，先拷进 deepseek-harness 的 `tmp/`（见 [../README.md](../README.md)）。

## 状态

## 状态

**框架已立，实验目录逐个补。**

当前 **131 个文件**。两类来源：

- **文档代码块** —— 正文写过内容的每一行都逐字照搬；
- **`cordis.yml`** —— 挂哪些插件由各目录的 `.ts` 和正文的运行命令确定，按代码补全（不是反推正文叙述）。

### 待补：文档里没给源码的实验文件（共 22 个）

这些都是**真代码**（插件体、脚本、启动器），文档没给就不写：

| 章 | 目录 | 缺的文件 | 说明 |
| --- | --- | --- | --- |
| 5 | `05-config-class-module` | `cfg-class-module.ts` | 正文说「只差一行」，但那一行没写出来 |
| 5 | `05-config-none` | `no-config.ts` | 正文只描述「一个完全没有 Config 的类插件」 |
| 5 | `05-default-export` | `default-fn.ts` | 被第 1 章 Q4、第 5 章 5.5 和总览三处引用，代码从未出现 |
| 5 | `05-js-tag` | `js-tag-demo.ts` | 正文只描述「普通插件，`greeting` 默认 `'Hello'`」 |
| 5 | `05-js-tag-id` | `js-tag-demo.ts` | 同上（拷贝） |
| 5 | `05-schema-shape` | `cordis.yml` + 启动器 | `schema-shape.ts` 是纯脚本、没有 `apply`，`bin.js` 挂不上它；正文没给启动器 |
| 6 | `06-entry-id` | `a.ts`、`b.ts` | 正文只在输出里出现过 `alpha 加载` / `beta 加载` |
| 6 | `06-disabled` | `report.ts`、`run.sh` | 正文说「在 1 秒和 13 秒各打一次所有 fiber 状态」 |
| 6 | `06-group` | `x.ts`、`y.ts`、`run.sh` | 正文说「各自在挂载和卸载时打印一行」 |
| 6 | `06-hmr` | `run.sh` | 正文给了三条命令行，没给脚本 |
| 6 | `06-hmr-config-error` | `hello.ts` | 正文只给出它的输出（`hello is ACTIVE`） |
| 6 | `06-hmr-reload-error` | `hello.ts` | 同上 |
| 6 | `06-inject-why` | `dynamic.ts`、`orphan.ts`、`run.sh` | 第 3 章只描述了时间线和 `run.sh` 的行为 |
| 6 | `06-pending-fixed` | `dump-all.ts` | 正文说「把所有 fiber 的名字和状态都打出来」 |
| 6 | `06-duplicate-service` | `dump-all.ts` | 同上 |

> 第 1–4 章、第 7–8 章的实验源码**无缺口**（加上本次补的 `cordis.yml` 全部就位）。
>
> 作者把真源码发来后，按目录逐行回填。

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
