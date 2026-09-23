# 提案：tea-shop-demo —— 自己声明事件（奶茶店样本）

- 日期：2026-08-22
- 状态：待确认（探索完成，开发前需确认）
- 对应官方指引：cordis-tutorial 04-events（声明/发出/监听、五种分发模式、waterfall 纪律）
- 系列位置：第 6 个实战；承接 events-demo——那个实战只监听真实事件、刻意不自声明，本实战把「声明 + 发出」补齐，事件机制收口
- 探索结论：方向「自己声明事件」，领域用奶茶店（方案 A，用户拍板）——**一看就是 sample**，避免 job-runner 那种会被误认为真实系统的名字

## 选题依据

1. events-demo 提案与笔记明确排期：监听半场练完，声明/发出的下半场留给下一个实战。
2. 真实 harness 的自声明服务参照（已摸底）：workflow 包声明 `workflow/start`、`workflow/phase`、`workflow/log`、`workflow/agent-start`、`workflow/agent-end` 事件族（payload 带身份快照、start/end 配对、全部 @mode emit）；goal 包声明 `goal/changed`。生产方模式 = 服务里 `declare module` + 方法内 `ctx.emit`。
3. 事件族纪律与会话事件族（command/run ↔ command/done、tool/call ↔ tool/result）和 conversation-node 的 start/update/end 同一套：稳定 id、start/end 配对、payload 带身份快照。
4. events-demo 的缺口：serial/bail/parallel 当时只能用测试夹具。本实战用自有事件给三种模式真实语义，五种分发模式在「自声明」语境下全部落地。

## 实战形态

目录结构：

```
examples/tea-shop-demo/
├── src/
│   ├── tea-shop.ts        # 生产方：TeaShopService（ctx.teaShop），声明并发出全部事件
│   ├── order-watch.ts     # 消费方：监听事件族，派生自己的事件 orders/served
│   └── shop-policy.ts     # 消费方：监听 order/request（waterfall），打烊时拒单
├── tests/tea-shop-demo.spec.ts
├── cordis.yml
├── tea-shop.patch.yml
└── LICENSE
```

事件族（全部由 tea-shop 服务声明，@mode 即契约）：

| 事件 | 模式 | 语义 | 例子 |
|---|---|---|---|
| `order/start` | emit | 下单（事件族 start，配对 ready） | { orderId, drink } |
| `order/ready` | emit | 出杯（配对 end） | { orderId, drink } |
| `barista/pick` | serial | 第一个空闲店员接单（first-answer-wins） | (orderId) → 店员 id |
| `shop/open` | bail | 同步开门检查，第一个回答说了算 | () → boolean |
| `notify/patrons` | parallel | 叫号广播，通知所有在等的人，全部完成才返回 | (orderId) |
| `order/request` | waterfall | 店规拦截（打烊拒单 / 特殊要求询问） | (order) → 接单/拒单 |

> 砍了 `order/brewing`（制作进度，纯增味）：事件族纪律靠 start ↔ ready 配对就够表达，五种分发模式（emit / serial / bail / parallel / waterfall）仍全部自有声明——这是本实战区别于 events-demo（serial/bail/parallel 只能用夹具）的核心价值。若想再瘦一刀，可砍 `shop/open`（bail 退回测试夹具），但会破坏「五种模式全自声明」的完整性，不推荐。

服务方法驱动完整流程：`placeOrder(drink)` 先走 `order/request`（waterfall）→ 通过后 `emit order/start` → `serial('barista/pick')` 选店员 → `emit order/ready`；`announce(orderId)` 走 `parallel('notify/patrons')`；`open()` 走 `bail('shop/open')`。

消费方：

| 插件 | 角色 | 教学点 |
|---|---|---|
| order-watch | 观察者 | `import type {} from './tea-shop.ts'` 拿类型合并；监听 order/start + order/ready，派生自己的事件 `orders/served`（跨插件监听 + 派生） |
| shop-policy | 决策者 | 监听 order/request（waterfall），Config `{ closed: boolean }` 为 true 时不调 next() 直接拒单（决策者角色延续 events-demo） |

测试与验证方式（约 11 用例，进程内、零外部依赖）：

- 事件族：placeOrder 依次发出 start → ready，payload 带同一 orderId（身份快照纪律）；order/start 与 order/ready 配对
- serial：注册两个店员监听器，第一个胜出、第二个不被调用；无监听器时返回 undefined
- bail：同步开门检查，第一个回答的说了算
- parallel：注册多个顾客监听器，全部被通知、全部完成才返回
- waterfall：shop-policy 打烊（config）时 placeOrder 被拒，营业时通过；无监听器时默认放行
- 派生：order-watch 在 order/ready 后发出 orders/served
- ctx.on disposer 自动清理；Loader-safe 导出（name / inject 形状）

验证闭环：测试（行为）+ 组合树（cordis.yml / patch 挂载）。事件类插件无 UI，不做 web 端到端（与 events-demo 一致）。

## 风险与开放问题

1. **事件数量**：6 个事件（2 emit + serial + bail + parallel + waterfall）。若开发中发现仍偏重，唯一可再砍的是 `shop/open`（bail 退回测试夹具），但不推荐——会破坏「五种模式全自声明」的完整性。
2. **@mode 是契约不是强制**：声明里的 @mode 是文档约定，实际行为取决于分发方调用 ctx.emit / ctx.serial / ctx.bail / ctx.parallel / ctx.waterfall 的哪一个。README/笔记要讲清这个对应关系，避免读者以为声明会自动决定分发。
3. **领域趣味性 vs 教学聚焦**：奶茶店场景自带进度感与叫号，但也可能引入与事件无关的趣味细节；开发时克制，别让领域细节抢走事件教学的主线。

## 否决项（探索阶段明确不做）

- Client 插件、approval/request、units 多 provider（均为后续候选，另行探索）
- 本实战不含任何真实 harness 事件的监听（那是 events-demo 的主题）——纯自声明，教学边界干净

> 说明：领域名 tea-shop-demo（奶茶店），一眼 sample，不与任何真实系统撞名。
