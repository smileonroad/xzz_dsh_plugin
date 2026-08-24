# 2026-08-22 — tea-shop-demo，事件的下半场，自己声明自己喊

## 事情是这样的

上一篇 events-demo 把事件的监听半场练完了，但有个口子我故意留着的，自己声明事件。

监听是「有人喊，我听着」，声明是「我定义事件，我自己喊」。events-demo 全篇监听真实 harness 事件，一个自有事件都没声明（除了测试夹具），就是为了把声明这半场留给这篇。

这篇走的是新流程，先探索，再提案，最后开发。

探索的产出是一份提案（docs/proposals/2026-08-22-tea-shop-demo.md），里面把选题依据、事件清单、消费方分工、风险都写明白了。事件数量就是探索时砍的，从七个砍到六个，把纯增味的进度事件砍了，五种模式一个没少。提案确认后才动手，跟 events-demo 那次一个流程。

探索的时候，领域一开始叫 job-runner，任务系统，我当时觉得挺顺，start、progress、end，事件族天然。结果被否了，原因是一看就容易被当成真在做任务系统。我当时还有点不服，任务系统哪不好了？？？

后来想明白了，问题不在领域好不好，在名字诚不诚实。学习样本最忌讳的就是名字像真货，读者会拿它当产品标准去衡量。于是换成了奶茶店。中杯去冰三分糖，等号，叫号器响了，拿奶茶走人。谁也不会把奶茶店点单当真系统，一看就是 sample。领域定了，事件族自然就有了。

## 事件的另一半，声明和发出

events-demo 里我监听的是别人声明的事件，声明长什么样，我只在源码里见过。这次自己写，才发现声明本身就是一门手艺。

```ts
// examples/tea-shop-demo/src/tea-shop.ts（节选）
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

declare module 合并进 cordis 的 Events 接口，从此全项目 TypeScript 都知道有这些事件，ctx.emit、ctx.on 都是强类型的。这就是类型化事件的意思，不是注释约定，是编译期就钉死的契约。

每个事件还标了 @mode，这是更细一层的契约。emit、serial、bail、parallel、waterfall，声明里写清楚，监听者按模式行事。但要注意，@mode 是文档不是强制，实际行为取决于分发方调的是 ctx 的哪个方法，这层对应关系 README 里写明白了。

## 奶茶店，一个自带事件族的生活流

奶茶店的好处是，它的业务流本身就是事件流。

下单，order/start，你点了一杯波霸奶茶，orderId 生成了。出杯，order/ready，orderId 还是那个。start 和 ready 靠 orderId 配对，就像 command/run 配 command/done，workflow/start 配 workflow/agent-end，这是 harness 自己都在用的纪律，身份快照，每个 payload 都带。

我特意翻了 workflow 包的源码当参照，人家在 packages/workflow/workflow/src/index.ts 里声明了 workflow/start、workflow/phase、workflow/log、workflow/agent-start、workflow/agent-end 一串，每个都带 WorkflowRunInfo 身份快照。奶茶店是它的缩小版，六个事件，一个 orderId 串全场。

配对不是小事。会话日志里 command/run 和 command/done 就是这么一对，tool/call 和 tool/result 也是一对，全是靠 id 关联的。你要是只发一个 start 没有 end，或者 end 里不带 orderId，消费方就只能猜，猜就容易错。所以事件族的第一个规矩，payload 必须带身份快照，start 和 end 必须成对。client-plugin 摘要里 conversation-node 的 start/update/end 也是同一套，客户端渲染整条链路就靠这个 id 串起来。

制作进度那玩意我们砍了，探索时定的，七砍一。事件族纪律靠 start 和 ready 配对就够表达，中间的过程事件纯属增味，砍了不心疼。

## 五种模式，这回全是真的

events-demo 里 serial、bail、parallel 是测试夹具，因为真实 harness 里几乎用不到。这次自声明，三种模式都有了真实语义。

选店员是 serial，第一个空闲的店员接单，first-answer-wins，第二个根本没机会开口。开门检查是 bail，同步问一句店开没开，第一个回答的说了算，没人答就当打烊。叫号是 parallel，一声广播所有在等的顾客都收到，而且全部响应完才返回。

waterfall 是店规，order/request，打烊的时候 shop-policy 直接拒单，不调 next()，一票否决。跟 events-demo 的 tool-policy 一个角色。

这三种模式以前我只知道定义，这次才体会到为什么它们各自适合各自的语义。选店员要的是「第一个可用的人」，串行裁决正好，第二个根本不用问。叫号要的是「所有人都听到」，并行广播正好，谁快谁慢无所谓，但都得等。店规要的是「能不能接」，waterfall 正好，拦在入口，一票就能否决。模式的语义和业务的语义对上了，代码读起来就是故事。

五种模式，六个事件，全自声明，全真实语义。事件这章，到这儿才算完整练完。

## 消费方，type-only import 和派生

生产方会喊了，消费方怎么接自己的事件，events-demo 教过监听，这次多两个细节。

第一个是 type-only import。order-watch 里写一行 import type { OrderInfo } from './tea-shop.ts'，生产方的 Events 合并就被拉进编译了，纯类型，无运行时依赖。这是跨插件共享类型声明的正路，不 import 代码，只 import 契约。

第二个是派生。order-watch 监听 order/ready，然后发出自己的事件 orders/served。监听别人的事件，吐自己的事件，事件可以喂事件，这跟 units-capability 的服务缝一个思路，契约在中间，两边各干各的。

shop-policy 就更简单了，延续 events-demo 的决策者角色，监听 order/request，Config 里 closed 一开，直接拒单。这个 Config 套路是 csv-query 那篇练的，现在信手拈来。

## 测试，十二个用例一次全过

这次测试最省心，进程内，零外部依赖，全是我自己声明的服务。

装配也简单，new 一个 Context，把 tea-shop 插件挂上，要测消费方就再挂 order-watch 或者 shop-policy，跑完收工。不像工具那几篇还要挂 SystemPrompt 和 ToolRuntime，自声明的事件零外部依赖，这本身就是自声明的好处，契约是我自己的，测试环境我说了算。

十二个用例。事件族配对（start 和 ready 同一 orderId）、每单独立身份、waterfall 三种情况（打烊拒单、营业放行、没人答默认接）、serial 先到先得和无监听、bail 失败关闭和先答先赢、parallel 全部完成才返回、派生事件、ctx.on disposer、Loader 安全导出。

一次全绿，56 毫秒。

这十二个用例没有一个是凑数的，每种模式至少一条，事件族配对单独钉了两条，坏的情况（打烊拒单、没人答默认接）和好的情况都覆盖了。测试描述行为，钉的就是这套事件契约。

## 领域选择，名字要诚实

回到探索时那个转折。

job-runner 被否，我当时还有点不服，任务系统哪不好了。后来想明白了，问题不在领域好不好，在名字诚不诚实。一个教学样本，名字却像要上生产的系统，读者第一反应不是「哦这是个玩具」，而是「这任务系统做得也太糙了」。奶茶店就没有这个负担，它从一开始就说了，我是来演示事件的，不是来开店的。

这跟命名空间一个道理，插件名、事件名、包名，名字是给读者看的第一份契约。起名字的时候，先想清楚别人第一眼会怎么想。

后来我给自己立了个规矩，教学样本的命名先过一遍「第一眼测试」，名字给读者看的第一眼，是让他们知道这是玩具，不是让他们以为这是产品。奶茶店过了，job-runner 没过。

事件这套机制，从监听练到声明，到这里算是收口了。上一篇我记了一句话，服务是你伸手要，事件是你喊一嗓子。现在我会喊了，也知道喊出来的话会被怎么接住了。

## 接下来该干嘛

事件话题收口，后续候选还有几个。

Client 插件是最大的空缺，浏览器侧那一套，slot、组件、store 纪律，是另一个世界，值得单独大探索。approval/request 自动审批也还挂着，教程点名过的 waterfall。units 多 provider 那半道题也在。

或者换换口味，回去补生命周期和 effect，把热插拔的清理顺序系统捋一遍。

反正流程熟了，探索 → 提案 → 开发，想碰哪个，先探索再说。
