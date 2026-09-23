# Cordis 教程跟学笔记

> 配套 [官方教程](../../sources/cordis-tutorial/index.zh.md)，动手实跑 + 源码印证。
>
> 前置笔记：[TypeScript 基础](../typescript-basics.md) · [架构文档阅读](../architecture-reading.md)

---

## 本目录的文件

笔记拆成了 8 个文件（教程 7 章 + cookbook 参考 1 章），每个都能单独读：

```
notes/cordis-tutorial/
├── README.md                  ← 你在这里（总览 + 实验目录 + 通用运行方式）
├── 01-第一个插件.md
├── 02-生命周期与-effect.md
├── 03-服务.md
├── 04-事件.md
├── 05-配置.md
├── 06-组合与-HMR.md
├── 07-进入-harness.md
└── 08-工具编写参考.md
```

章节之间会互相引用（比如「见 [6.5 服务名撞车](06-组合与-HMR.md#65-服务名撞车先注册的胜出后注册的静默-failed)」），点链接直接跳。

> **进度**：第 1–5 章已落盘，第 6–8 章待补。第 6 章的 `06-inject-why/` 因被第 3 章大量引用，已提前落盘。这一行随补随改。

---

## 这份笔记怎么用

每个**理论**后面都紧跟一个 **🧪 验证实验** 块，四件套齐全：

```
📄 文件     —— 实验文件的路径
  代码      —— 该文件的完整内容（可直接复制）
▶️ 运行     —— 复制粘贴就能跑的命令
  输出      —— 我在本机跑出来的【真实输出】，不是编的
```

**建议读法**：先读理论 → 别急着看输出 → 自己把命令跑一遍 → 再看我的输出对不对得上。

理论是别人告诉你的，**输出是你自己看到的**。两者对不上时，永远信输出。

> ⚠️ 若你实测的结果和笔记里的**不一致**，请以你的为准 —— 输出优先于任何文字。
>
> **未实测的推论一律带 🚧 标记**，例如「🚧 这是推断，我没有实测」。看到 🚧 就知道那一条是从源码推出来的，别当结论用。

### 实验目录

实验源码在 [examples/cordis-tutorial/](../../examples/cordis-tutorial/)（**权威源在这边**，可阅读、可 diff）。**每个实验一个目录**，各自带一份 `cordis.yml`，可以单独运行、互不干扰。

```
01-learn-basics/examples/cordis-tutorial/
├── 01-first-plugin/            最小的函数插件
├── 01-baseurl/                 换个目录跑 → baseUrl 失效
├── 01-plugin-forms/            三种插件形态
├── 01-not-a-plugin/            没有 apply 的普通对象
├── 01-order/                   位置不决定顺序
├── 01-error-apply/             apply 里抛异常
├── 01-error-import/            模块路径写错
├── 02-lifecycle/               effect 的加载/卸载
├── 02-disposer-order/          逆序启动 + 并发完成
├── 03-service/                 服务提供方 + 消费方
├── 03-service-consumer-only/   只有消费方 → 静默 PENDING
├── 03-retrack/                 服务消失又回来
├── 04-events/                  emit 起手
├── 04-modes/                   五种分发模式
├── 04-bail-edge/               isBailed 的边界
├── 04-waterfall/               环绕中间件
├── 04-serial/                  首个 bail 值胜出
├── 04-parallel/                parallel 到底等什么
├── 05-config/                  配置 + 校验
├── 05-config-default/          不写 config → 填默认值
├── 05-config-invalid/          非法 config → 报错
├── 05-config-not-array/        cordis.yml 顶层不是数组
├── 05-config-class-module/     类插件 + 模块级 Config（❌）
├── 05-config-class-module-default/  同上，不写 config（❌ 连默认值都不填）
├── 05-config-class-static/     类插件 + static Config（✅）
├── 05-config-class-static-default/  同上，不写 config（✅ 填默认值）
├── 05-config-none/             完全没有 Config → 静默放行
├── 05-config-obj-default/      default 导出对象 + 对象字面量里的 Config（✅）
├── 05-named-class-only/        只有具名导出的类 → 根本不是插件
├── 05-static-inject/           类插件 + static inject
├── 05-schema-shape/            Schema 实例长什么样
├── 05-js-tag/                  !!js 求值
├── 05-js-tag-id/               !!js 用在 id 上（⚠️ 静默失效）
├── 05-default-export/          default 导出 + 模块级 inject（❌ 静默失效）
│
├── 06-entry-id/                id 稳不稳定（跑两次对比）
├── 06-disabled/                disabled 关掉/打开 + PENDING 自动复活
├── 06-disabled-silent-exit/    ⚠️ 全 PENDING → 进程静默退出（退出码 0）
├── 06-group/                   嵌套组是一个挂载/卸载单元
├── 06-isolate/                 isolate 让两个组各拿一份服务实例（✅）
├── 06-no-isolate/              同上但去掉 isolate（❌ 两组抢同一个）
├── 06-duplicate-service/       ⚠️ 服务名撞车：先注册的胜出，后者静默 FAILED
├── 06-hmr/                     改插件文件 → 自动重载
├── 06-hmr-config-error/        运行期改坏 cordis.yml（只记日志，不崩）
├── 06-hmr-reload-error/        运行期改成语法错误（回滚，能恢复）
├── 06-logger-level/            ⚠️ 日志级别是倒序的，warn 默认看不见
├── 06-pending-diagnose/        把 PENDING 的插件抓出来
├── 06-pending-fixed/           补上提供方 → 立刻 ACTIVE
├── 06-inject-why/              ⭐ inject 到底做了什么（门控 / store / 依赖变化重载）
│
├── 07-greet-tool/              ⭐ 主实验：注册工具 + 真实流水线 + tools/result 观察
├── 07-schema/                  defineTool 是纯函数：简写规约 → JSON Schema
├── 07-args-invalid/            参数校验拦在 execute 之前（探针不打印）
├── 07-unregister/              register 的 disposer：注销 + tools/change + UNKNOWN_TOOL
├── 07-abort/                   signal 三态：中途取消 / 预先取消 / 不可取消占位符
├── 07-missing-provider/        缺 systemPrompt → 整条链 PENDING → 静默退出
│
├── 08-policy-chain/            ⭐ 五层策略钩子的实测顺序（编号日志 1-9）
├── 08-deny-guard/              两层拒绝：pre-execute deny 与 guard 单调拒绝
├── 08-post-execute/            结果改写：替换 content（value 保留）与 block
├── 08-output-invalid/          违反 output.schema → INVALID_TOOL_OUTPUT；body 抛异常 → isError
├── 08-nested-schema/           嵌套 schema：oneOf 恰好一个、additionalProperties、空字符串边界
└── 08-presentation-soft/       presentCall/presentResult 软校验：非法 args → undefined，绝不抛
```

> 实验是本仓库的源码，但**要跑到 deepseek-harness 检出目录里** —— 见下面的「通用运行方式」。

### 通用运行方式

要 `tsx` 和 `@deepseek-ai/*` 的解析，所以先拷进 harness 的临时目录（那边 `.gitignore` 里有 `tmp/`），再在实验自己的目录里启动：

```sh
H=/d/myPI/deepseek-harness
cp -r <本仓库>/01-learn-basics/examples/cordis-tutorial "$H/tmp/cordis-tutorial"
cd "$H/tmp/cordis-tutorial/<实验目录>"
node --import tsx ../../../vendor/cordis/bin.js
```

`../../../` 是从实验目录回到 harness 根。

**为什么必须在实验自己的目录里跑**：`bin.js` 把 `ctx.baseUrl` 设成**当前工作目录**，而 `cordis.yml` 里的 `./xxx.ts` 是相对 `baseUrl` 解析的。站在 harness 根目录跑就会找不到文件。

> 🔗 这不是巧合 —— 见 [1.2 启动器只做三件事](01-第一个插件.md#12-启动器只做三件事)。

---

## 目录

| 章 | 文件 | 讲什么 |
|---|---|---|
| 1 | [你的第一个插件](01-第一个插件.md) | 最小的插件、`cordis.yml`、三种形态、**位置不决定顺序**、报错的两种动词 |
| 2 | [生命周期与 effect](02-生命周期与-effect.md) | `ctx.effect` 的四条契约、**Fiber 状态机**、逆序卸载与并发启动 |
| 3 | [服务](03-服务.md) | 服务的运行期 + 编译期两半、**消费的三种写法**、`inject` 到底做了什么、扁平命名空间 |
| 4 | [事件](04-事件.md) | 五种分发模式（`emit`/`parallel`/`serial`/`bail`/`waterfall`）、`isBailed` 陷阱 |
| 5 | [配置](05-配置.md) | `Config` 的双重身份、**指针规则（`Config` 挂在哪才会被看见）**、`ValidationError`、`!!js` |
| 6 | [组合与 HMR](06-组合与-HMR.md) | 条目元数据（`id`/`disabled`/`isolate`）、组分单元、**HMR 热重载**、诊断 PENDING |
| 7 | [进入 harness](07-进入-harness.md) | 真实的 `tools` 服务：`defineTool`、执行流水线、**`tools/result` 的时序**、前六章模式总演习 |
| 8 | [工具编写参考](08-工具编写参考.md) | cookbook 深入：**五层策略钩子实测顺序**、output.schema 校验、schema DSL 边界、UI 投影软校验 |

> 第 8 章对应的不是教程系列，而是教程第 7 章结尾指路的 [sources/cookbook/adding-a-tool.zh.md](../../../03-practice-plugin/sources/cookbook/adding-a-tool.zh.md)（工具编写参考）。

每章末尾都有 **自测**（答案折叠在 `<details>` 里），建议先自己答再展开。

---
