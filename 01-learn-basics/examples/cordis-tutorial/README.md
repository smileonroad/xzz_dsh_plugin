# cordis-tutorial 实验

配合 [Cordis 教程跟学笔记](../../notes/cordis-tutorial/) 的实验源码。**权威源在这里**；要跑，先拷进 deepseek-harness 的 `tmp/`（见 [../README.md](../README.md)）。

## 状态

**框架先立起来，实验目录逐个补。**

已落盘 26 个目录：

| 章 | 实验目录 |
| --- | --- |
| 1 | `01-first-plugin`、`01-baseurl`、`01-plugin-forms`、`01-not-a-plugin`、`01-order`、`01-error-apply`、`01-error-import` |
| 2 | `02-lifecycle`、`02-disposer-order` |
| 3 | `03-service`、`03-service-consumer-only`、`03-retrack` |
| 4 | `04-events`、`04-modes`、`04-serial`、`04-parallel`、`04-bail-edge`、`04-waterfall` |
| 5 | `05-schema-shape`、`05-config`、`05-config-default`、`05-config-invalid`、`05-config-none`、`05-config-not-array`、`05-config-class-static`、`05-config-class-static-default`、`05-config-class-module`、`05-config-class-module-default`、`05-config-obj-default`、`05-named-class-only`、`05-static-inject`、`05-js-tag`、`05-js-tag-id` |
| 6（提前） | `06-inject-why` |

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
