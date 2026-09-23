# cordis-tutorial 实验

配合 [Cordis 教程跟学笔记](../../notes/cordis-tutorial/) 的实验源码。**权威源在这里**；要跑，先拷进 deepseek-harness 的 `tmp/`（见 [../README.md](../README.md)）。

## 状态

## 状态

**框架已立，实验目录逐个补。只放文档真正给过的源码 —— 不反推。**

当前 **116 个文件**，每一个都能在 `notes/cordis-tutorial/` 的代码块里找到对应内容。

### 待补：文档里没给源码的实验文件（共 37 个）

这些文件名在各章的运行命令、输出或叙述里出现过，但**文档本身没有给出它们的内容**（章内引用处写成 `./cfg-class-xxx.ts` 占位、或只描述了行为）。不反推，宁可空着：

| 章 | 目录 | 缺的文件 |
| --- | --- | --- |
| 1 | `01-not-a-plugin` | `cordis.yml` |
| 4 | `04-modes` | `cordis.yml` |
| 4 | `04-serial` | `cordis.yml` |
| 4 | `04-parallel` | `cordis.yml` |
| 4 | `04-bail-edge` | `cordis.yml` |
| 4 | `04-waterfall` | `cordis.yml` |
| 5 | `05-config-class-static` | `cordis.yml` |
| 5 | `05-config-class-static-default` | `cordis.yml`（整个目录空着） |
| 5 | `05-config-class-module` | `cfg-class-module.ts`、`cordis.yml`（整个目录空着） |
| 5 | `05-config-class-module-default` | `cordis.yml`（整个目录空着） |
| 5 | `05-config-none` | `no-config.ts`、`cordis.yml`（整个目录空着） |
| 5 | `05-named-class-only` | `cordis.yml` |
| 5 | `05-default-export` | `default-fn.ts`、`cordis.yml`（整个目录空着；该目录被第 1 章 Q4、第 5 章 5.5 和总览引用，但从未给出代码） |
| 5 | `05-js-tag` | `js-tag-demo.ts` |
| 5 | `05-js-tag-id` | `js-tag-demo.ts` |
| 5 | `05-schema-shape` | `cordis.yml`、启动器（`schema-shape.ts` 是纯脚本没有 `apply`，`bin.js` 挂不上它） |
| 6 | `06-entry-id` | `a.ts`、`b.ts` |
| 6 | `06-disabled` | `report.ts`、`run.sh` |
| 6 | `06-group` | `x.ts`、`y.ts`、`run.sh` |
| 6 | `06-hmr` | `run.sh` |
| 6 | `06-hmr-config-error` | `hello.ts` |
| 6 | `06-hmr-reload-error` | `hello.ts` |
| 6 | `06-logger-level` | `cordis.yml`、`cordis.default.yml` |
| 6 | `06-pending-fixed` | `dump-all.ts` |
| 6 | `06-duplicate-service` | `dump-all.ts` |
| 6 | `06-inject-why` | `dynamic.ts`、`orphan.ts`、`run.sh` |

> 第 2、3、7、8 章**没有缺口** —— 那四章的实验源码文档全给了。
>
> 各处 `cordis.yml` 大多只是一行 `- name: './x.ts'`，但既然文档没写，就不放。
> 作者把真源码发来后，按目录逐个回填。

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
