# cordis-tutorial 实验

配合 [Cordis 教程跟学笔记](../../notes/cordis-tutorial/) 的实验源码。**权威源在这里**；要跑，先拷进 deepseek-harness 的 `tmp/`（见 [../README.md](../README.md)）。

## 状态

**152 个文件，60 个目录全部拷进 harness 实跑过。** 三类来源：

- **文档代码块** —— 正文写过内容的每一行都逐字照搬；
- **`cordis.yml`** —— 挂哪些插件由各目录的 `.ts` 和正文的运行命令确定，按代码补全（不是反推正文叙述）；
- **补全件** —— 文档没给内容的真代码，按正文描述 + 同模块／相邻实验源码补出，首行带标记。

## 实测校验（2026-09-23，harness `c36a83ff6b`）

整个目录拷到 deepseek-harness 的 `tmp/cordis-tutorial/` 逐个跑，和笔记里的记录输出对：

- **49 / 60 个实验逐字或语义吻合**，其中 **07、08 两章 12 个全部一字不差**；
- **11 个不一致**，其中 **10 个同一根因**。

### 根因：harness 不再把加载失败抛出来

第 1 章和 5.6 写的「报错 + 退出码 1」在当前 harness 上**复现不了** —— 那些实验现在**零输出、退出码 0**。

差异在 `vendor/loader/src/config/group.ts` 的 `update()`：

```ts
await this.create(newMap[id]).catch((error) => { this.ctx.logger.error(error) })
```

笔记引用的那段 `if (failures.length === 1) throw failures[0]` **在当前源码里已经不存在**。于是 `bin.js` 的顶层 `await` 永远不 reject。

更麻烦的是：错误虽被记进 `logger.error`，但**启动期的日志会丢** —— `logger-console` 和出错的条目是并发加载的，exporter 还没注册。实测：一个在 `apply` 里发 `ctx.logger.error` 的插件，启动时**一个字也看不到**。

受影响的 10 个：`01-baseurl`、`01-error-apply`、`01-error-import`、`01-not-a-plugin`、`05-config-invalid`、`05-config-not-array`、`05-config-class-static`、`05-config-obj-default`、`05-named-class-only`、`05-config-class-module-default`。

> 这一条反过来把第 6 章的结论又钉了一遍：**失败是静默的，而且启动期连 `error` 都静默。**

### 另一个：`05-js-tag-id` 的 `probe.ts`

`probe.ts` 是文档给的，但它现在只能拿到 `include` 一个条目（`./js-tag-demo.ts` 那一组不见了，且 `Hello, world!` 跑到最后）。原因是 `loader/entry-init` 的触发时机变了。**不是补全件的问题。**

### 实测反推出来的三处错误（已修）

| 文件 | 错在哪 | 修法 |
| --- | --- | --- |
| `06-disabled/consumer.ts` | 我抄了 03-service 的 `Hello, world!`；文档输出是 `✅ consumer 加载了：Hello, world!` | 改文案，已复现 |
| `06-hmr-config-error/cordis.yml` | **漏了 `timer` 条目** → `Hmr` 卡 PENDING（它 `@Inject('loader') @Inject('timer')`）→ 整个实验什么都不跑 | 补上，已复现 |
| `06-hmr-reload-error/cordis.yml` | 同上 | 补上，已复现 |

### 两个 `-default` 目录少了插件文件（已补）

章内说四个目录是「同一个插件，只差／不写 config」，所以 `05-config-class-static-default/` 和 `05-config-class-module-default/` 各自需要一份插件文件。补上后，前者输出与文档**逐字一致**。

### 已知但不算错的差异

| 实验 | 差异 | 原因 |
| --- | --- | --- |
| `06-entry-id` | `alpha 加载` / `beta 加载` 先后与条目顺序不同 | 条目并发加载，顺序本就不保证 |
| `06-disabled` | `report.ts` 那行列了 8 个 fiber，文档只列 5 个且顺序不同 | 格式无从推得；**信息一致**（谁 PENDING、谁 ACTIVE 全对） |
| `02-disposer-order`、`04-parallel` | 毫秒数不同 | 机器差异 |
| HMR 三个 | 日志文案略有版本差（如文档的 `config reload at ... failed`） | harness 版本演进 |

---

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
