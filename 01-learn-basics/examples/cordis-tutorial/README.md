# cordis-tutorial 实验

配合 [Cordis 教程跟学笔记](../../notes/cordis-tutorial/) 的实验源码。**权威源在这里**；要跑，先拷进 deepseek-harness 的 `tmp/`（见 [../README.md](../README.md)）。

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
node --import tsx ../../../vendor/cordis/bin.js     # 正常跑
node --import tsx ../_diag.ts                      # 要看失败信息时用这个
```

拷过来之后，在每个实验自己的目录里启动 —— 原因见 [../README.md](../README.md) 的「怎么跑」。

两个启动器的区别见上面的[「怎么看到失败」](#怎么看到失败用-_diagts)：`bin.js` 是原样的，`_diag.ts` 把日志出口提前装好，启动期的错误才看得见。
