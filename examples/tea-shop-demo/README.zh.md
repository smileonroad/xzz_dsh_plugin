# tea-shop-demo 实战

[English](README.md) | 中文

在 dsh 里，插件之间互不 import，只通过两种机制耦合：**服务**（「我要用你的能力，你先把东西给我」）和**事件**（「我不知道谁在听，反正我喊一嗓子」）。事件用 `ctx.emit` 发出、用 `ctx.on` 收听，两边都有类型检查。

这个实战练事件的**生产方**：插件怎么自己定义类型化事件、自己发出。故事是家奶茶店——下单、制作、出杯——刻意做成玩具大小，一看就是教学样本，不是真实系统。它跟 [events-demo](../events-demo/) 配对，那个实战练的是消费方（监听 dsh 自己的真实事件）；这个实战六个事件全部自声明，五种分发模式全用上，包括真实 harness 几乎用不到的三种（先到先得、扇出、中间件）。

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

> 注意：事件类插件**没有可见 UI**。挂进 web 自己不会显示任何东西，所以本实战有意义的验证是测试套件。patch 文件的存在是为了在需要时把演示奶茶店挂到运行中的实例上。
>
> 注意：patch 里 entry 的 `name` 是相对**profile 目录**（`~/.dsh/profiles/web/`）解析的，不是相对本文件。`tea-shop.patch.yml` 用的是相对路径 + profile 目录下的 junction；首次使用前建一次 junction（Windows，无需管理员权限）：
>
> ```sh
> cmd //c "mklink /J %USERPROFILE%\.dsh\profiles\web\examples <deepseek-harness>\examples"
> ```

## 设计

### 事件分两半

监听是一半：有人喊，你反应（`ctx.on`）。声明与发出是另一半：你来定义喊话长什么样，并且由你喊出去。events-demo 练的是监听（听 dsh 自己的事件），这个实战练的是声明与发出，从零开始。

### 类型化事件是编译期契约

奶茶店把事件合并进 Cordis 的 `Events` 接口来声明：

```ts
declare module '@deepseek-ai/cordis' {
  interface Events {
    'order/start'(order: OrderInfo): void
    'order/ready'(order: OrderInfo): void
    'barista/pick'(orderId: string): string | undefined | Promise<string | undefined>
    'shop/open'(): boolean | undefined
    'notify/patrons'(orderId: string): void | Promise<void>
    'order/request'(order: OrderRequest, next: () => Promise<OrderDecision>): Promise<OrderDecision>
  }
}
```

「类型化」的意思是，事件名、参数、返回值在整个项目里都经过编译期检查——`ctx.emit` 和 `ctx.on` 都知道事件的精确形状。每个事件还带一个 `@mode` 标注，说明监听器会被怎么调用。这个标注是契约的一部分：分发方必须调用对应的 ctx 方法（`ctx.emit`、`ctx.serial`、`ctx.bail`、`ctx.parallel`、`ctx.waterfall`）。

> **深入：为什么要用 `declare module`？**
>
> TypeScript 的接口可以**合并**——同名 `interface` 声明会叠加，不会互相覆盖。`declare module '@deepseek-ai/cordis'` 是在不修改 cordis 源码的前提下，往它的 `Events` 接口追加成员。合并之后，整个项目里 `ctx.emit('order/start', ...)` 和 `ctx.on('order/start', ...)` 的参数都被检查；没有这行声明，事件名就只是一个普通字符串，参数退化成 `any`，写错也不报错。类型化事件的价值，就是把这套约定从「运行时靠自觉」提前到「编译期被检查」。

### 事件族：start 与 end 配对

事件族描述同一件事的不同阶段，靠稳定 id 串起来。这里的 `order/start` 和 `order/ready` 都带同一个 `orderId`（身份快照），监听器可以配对它们。这与 harness 自己的纪律一致（`command/run` ↔ `command/done`、`workflow/start` ↔ `workflow/agent-end`）：有 start 没 end，或者 end 不带 id，监听器就只能猜。

> **深入：为什么 start 和 end 必须带同一个 id？**
>
> 想一个消费方：它把事件记进日志，之后要回答「这单到底完成了没有」。如果 `order/start` 和 `order/ready` 没有共同的 `orderId`，重放日志时你无法把 start 和 end 对上——不知道哪个 start 配哪个 end，也重建不出「完成」这个状态。真实 harness 的事件对（`command/run` ↔ `command/done`）都靠 id 关联，client 端的 conversation-node 也靠稳定 id 把整条链路渲染出来。身份快照不是锦上添花，是可重放性的地基。

### 五种分发模式，各司其职

事件的模式决定监听器怎么运行。奶茶店的六个事件覆盖全部五种模式，每种模式都选得跟业务语义对得上：

| 事件 | 模式 | 会发生什么 | 为什么用这个模式 |
|---|---|---|---|
| `order/start` / `order/ready` | emit | 广播，不等待 | 事件族在播报阶段变化，谁都不用回话 |
| `barista/pick` | serial | 监听器按顺序跑，直到有人返回值 | 第一个空闲店员接单——挨个问，问到有人接 |
| `shop/open` | bail | serial 的同步版 | 门口快速问一句「开门了吗」 |
| `notify/patrons` | parallel | 所有监听器并发跑，全部完成才返回 | 叫号广播——每个人都必须通知到 |
| `order/request` | waterfall | 监听器包裹一条 `next()` 链；不调 `next()` 即否决 | 店规守在入口：接单或拒单 |

服务方法负责驱动：`placeOrder(drink)` 先走 `order/request` 的 waterfall（打烊时拒单），再发 `order/start`，用 `serial` 选店员，最后发 `order/ready`；`announce(orderId)` 扇出 `notify/patrons`；`isOpen()` 走 `shop/open` 的 bail。

> **深入：waterfall 的 `next()` 到底怎么走？**
>
> 把它想成一根接力棒链条：监听器按注册顺序排队，最外层的先拿到接力棒；每个监听器收到 `(请求, next)`，调 `next()` 就是把接力棒传给下一个（或最内层的默认行为），返回值原路返回、每层还可以改写；不调 `next()` 直接返回，链条到此终止，后面的监听器和默认行为全部不执行。
>
> 奶茶店的 `order/request` 就是一根这样的链：
>
> ```
> 最外层 → shop-policy（店规）
>            │ 打烊？→ 返回 refuse，不调 next()，链条终止 → 订单被拒
>            │ 营业？→ 调 next()，接力棒传给默认行为
>            ▼
>          默认行为 → 返回 accept → 订单被接
> ```
>
> 这解释了 events-demo 里那条纪律：**只观察的监听器必须调 `next()`**——忘调等于你无声地吞掉了整条链，后面的决策者全都轮不到。

### 消费方

两个消费方插件展示在这些自声明事件上的监听侧：

- `order-watch` 只导入类型——`import type { OrderInfo } from './tea-shop.ts'`——把事件声明拉进自己的编译，无运行时依赖。它监听事件族，派生自己的 `orders/served` 事件。
- `shop-policy` 监听 `order/request` 的 waterfall，打烊时（`Config { closed }`）不调 `next()` 直接拒单，延续 events-demo 的决策者角色。

> **深入：`import type` 为什么能把事件声明带进另一个插件？**
>
> 类型导入和值导入都会让 TypeScript 把目标文件纳入编译范围。`order-watch.ts` 里的 `import type { OrderInfo } from './tea-shop.ts'` 一次做了两件事：既拿到了 `OrderInfo` 类型，也让 TypeScript 看到了 tea-shop.ts 里的 `declare module` 块——于是 `order/ready` 这些事件名在这个文件里同样可用、同样有类型。关键在于 `type` 关键字：编译后这一行 import 会被完全删除，`order-watch` 运行时对 tea-shop.ts 零依赖。消费者只消费契约，不消费实现。

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

> 关系说明：本目录是自声明事件实战的完整源码 + 测试包；`notes/2026-08-24-tea-shop-demo.md` 记录它背后的学习心得，成形它的提案在 `docs/proposals/2026-08-22-tea-shop-demo.md`。

- `src/tea-shop.ts` — `TeaShopService extends Service`（构造器把它注册成 `ctx.teaShop`）、声明全部六个事件并标 `@mode` 的 `declare module` 块、三个分发方法。店规拒绝时 `placeOrder` 抛结构化 `TeaShopError`（`code: 'refused'`）。
- `src/order-watch.ts` — `name = 'tea-shop-order-watch'`、`inject = ['teaShop']`；type-only import 拿类型合并；从 `order/ready` 派生 `orders/served`。
- `src/shop-policy.ts` — `name = 'tea-shop-shop-policy'`、`inject = ['teaShop']`、Schemastery `Config`（同名导出，csv-query-tool 的套路）；打烊时否决 `order/request`。
- `tests/tea-shop-demo.spec.ts` — 十二个用例：事件族配对与身份快照、waterfall 拒单/放行/默认、serial 先到先得与无监听、bail 失败关闭与先答先赢、parallel 全部完成才返回、派生事件、`ctx.on` disposer、Loader 安全导出。

跑测试：

```sh
pnpm exec vitest run examples/tea-shop-demo/tests/tea-shop-demo.spec.ts
```

## 怎么分发

与其他实战一致：本目录是**教学示例**，不是可安装包。要分发，按[打包教程](../../docs/user/develop/basic/publish.md)升级成 `packages/` 下的标准 bundle，再用 `dsh plugin --profile <name> add <package>` 安装。
