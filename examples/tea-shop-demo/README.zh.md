# tea-shop-demo 实战

[English](README.md) | 中文

**类型化事件的「声明与发出」半场**：一个奶茶店服务自己声明类型化事件族（`declare module` + `interface Events` 合并），并用全部五种分发模式发出。它收口了 events-demo 开启的事件故事——那个实战只**监听**真实 harness 事件、刻意不自声明，这个实战全部自声明，连 serial / bail / parallel 都带上真实语义。

## 运行

本目录是实战源码的**权威来源**。要运行，先把它拷贝到 deepseek-harness 源码的 `examples/`（那边的副本可能过期），再在 deepseek-harness 根目录操作：

```sh
# 1. 拷贝到 deepseek-harness 源码（本仓库是权威来源）
cp -r examples/tea-shop-demo ../deepseek-harness/examples/tea-shop-demo

# 2a. 跑测试
cd ../deepseek-harness
pnpm exec vitest run examples/tea-shop-demo/tests/tea-shop-demo.spec.ts

# 2b. 或挂进 web UI（临时，走 patch 层）
pnpm dsh web --patch examples/tea-shop-demo/tea-shop.patch.yml
```

> 注意：事件类插件**没有可见 UI**——挂进 web 自己不会显示任何东西，本实战有意义的验证是测试套件。patch 文件的存在是为了在需要时把演示奶茶店挂到运行中的实例上。
>
> 注意：patch 里 entry 的 `name` 是相对**profile 目录**（`~/.dsh/profiles/web/`）解析的，不是相对本文件。`tea-shop.patch.yml` 用的是相对路径 + profile 目录下的 junction；首次使用前建一次 junction（Windows，无需管理员权限）：
>
> ```sh
> cmd //c "mklink /J %USERPROFILE%\.dsh\profiles\web\examples <deepseek-harness>\examples"
> ```

## 设计

events-demo 用真实 harness 事件练了**监听**这半场。这个实战练**声明与发出**这半场：服务拥有自己的事件命名空间，每个事件上的 `@mode` 标注是契约的一部分，分发方必须调用对应的 ctx 方法。奶茶店的故事让它一眼就是 sample——谁也不会把奶茶点单演示当成真实系统。

生产方（`tea-shop`）声明六个事件，覆盖全部五种模式：

| 事件 | 模式 | 语义 |
|---|---|---|
| `order/start` | emit | 下单（事件族 start，按 orderId 与 ready 配对） |
| `order/ready` | emit | 出杯（事件族 end） |
| `barista/pick` | serial | 第一个注册的店员接单 |
| `shop/open` | bail | 同步开门检查；第一个回答说了算，没人答 = 打烊 |
| `notify/patrons` | parallel | 叫号广播，通知所有在等的人 |
| `order/request` | waterfall | 店规拦截：拒单或调 `next()` |

服务方法负责分发：`placeOrder(drink)` 先走 `order/request` waterfall（店规策略打烊时拒单），再发 `order/start`，用 `serial` 选店员，最后发 `order/ready`；`announce(orderId)` 扇出 `notify/patrons`；`isOpen()` 走 `shop/open` 的 bail。

两个消费方展示在自己事件上的消费侧：

- `order-watch` — `import type { OrderInfo } from './tea-shop.ts'` 把生产方的 `interface Events` 合并拉进自己的编译（纯类型、无运行时导入）；监听事件族，派生自己的 `orders/served` 事件。
- `shop-policy` — 监听 `order/request` waterfall，`Config { closed }` 打烊时不调 `next()` 直接拒单，延续 events-demo 的决策者角色。

这套拆分带出的规则：

- **事件族带身份快照。** 每个 payload 都带 `orderId`，`order/start` 与 `order/ready` 靠它配对——与 harness 自己的事件对（`command/run` ↔ `command/done`、`workflow/start` ↔ `workflow/agent-end`）同一套纪律。
- **@mode 是契约，不是强制。** 标注记录模式，实际行为取决于分发方调用的是 `ctx.emit` / `ctx.serial` / `ctx.bail` / `ctx.parallel` / `ctx.waterfall` 的哪一个。
- **消费方用 type-only import 合并声明。** `import type` 生产方，类型化事件名跨插件可见，无运行时依赖。
- **每种模式都有真实语义。** 与 events-demo 不同，serial（第一个店员）、bail（开门检查）、parallel（顾客扇出）都是声明出来、有真实含义地驱动，不是测试夹具。

## 怎么开发

```
tea-shop-demo/
├── src/tea-shop.ts      # 生产方：TeaShopService 声明并分发全部六个事件
├── src/order-watch.ts   # 消费方：监听事件族，派生 orders/served
├── src/shop-policy.ts   # 消费方：order/request waterfall 决策者（Config { closed }）
├── tests/tea-shop-demo.spec.ts # 12 个用例，进程内、零外部依赖
├── cordis.yml           # 组合：生产方 + 两个消费方
└── tea-shop.patch.yml   # web overlay 入口
```

> 关系说明：本目录是自声明事件实战的完整源码 + 测试包；`notes/2026-08-22-tea-shop-demo.md` 记录它背后的学习心得。成形它的提案在 `docs/proposals/2026-08-22-tea-shop-demo.md`。

- `src/tea-shop.ts` — `TeaShopService extends Service`（`super(ctx, 'teaShop')`）、`declare module` 块声明全部六个事件并标注 `@mode`、三个分发方法。店规拒绝时 `placeOrder` 抛结构化 `TeaShopError`（`code: 'refused'`）。
- `src/order-watch.ts` — `name = 'tea-shop-order-watch'`、`inject = ['teaShop']`；type-only import 拿类型合并；从 `order/ready` 派生 `orders/served`。
- `src/shop-policy.ts` — `name = 'tea-shop-shop-policy'`、`inject = ['teaShop']`、Schemastery `Config`（同名导出，csv-query-tool 的套路）；打烊时否决 `order/request`。
- `tests/tea-shop-demo.spec.ts` — 十二个用例：事件族配对与身份快照、waterfall 拒单/放行/默认、serial 先到先得与无监听、bail 失败关闭与先答先赢、parallel 全部完成、派生事件、`ctx.on` disposer、Loader 安全导出。

跑测试：

```sh
pnpm exec vitest run examples/tea-shop-demo/tests/tea-shop-demo.spec.ts
```

## 怎么分发

与其他实战一致：本目录是**教学示例**，不是可安装包。要分发，按[打包教程](../../docs/user/develop/basic/publish.md)升级成 `packages/` 下的标准 bundle，再用 `dsh plugin --profile <name> add <package>` 安装。
