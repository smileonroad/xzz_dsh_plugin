# 2026-09-07 — grill-send-button，一个往输入栏加按钮的 Client 插件

## 事情是这样的

laundry 那篇把 Client 插件的大门推开了一道缝，浏览器里能画聊天卡片了。可那道缝里还剩一块空地，界面本身。往对话里塞内容这件事，除了打字和模型回复，插件能不能在输入栏旁边加一个按钮，点一下就把预设的话发出去。这次的实战就是这块空地，往输入栏工具行加一个 ⚡ Grill 按钮，点击提交一句 `grill me`。需求很玩具，练的东西不玩具，这是第一个纯粹活在浏览器侧、连一个 Host API 都不碰的插件。

动手前先把两套插件机制的分界线想清楚，这是全篇的地基。

## Client 插件和 Host 插件是两套东西

Host 插件跑在 Node 进程里，`ctx.commands`、`ctx.tools` 那些注册表都在那边，挂上就能用，`--patch` 加载、vitest 能 mount，helloworld 那篇到 gatehouse 那篇练的全是这一侧。Client 插件跑在浏览器里，能碰的是 UI 那一侧，`ctx.slots` 槽位系统、React 组件、会话作用域给 UI 组件提供的 standard props。它没有 `ctx.commands`，也没有 Host 的注册表。

所以「往输入栏加按钮」这件事只能走 Client 侧，用槽位系统。也正因为它没有 Host 注册表，它不能像 Host 插件那样被 Node vitest mount 起来测，怎么验证成了后面一个独立课题。

## 槽位系统：list 槽，新 id 是新增不是替换

目标是 `conversation.input.right` 这个槽，输入栏的工具行。一开始最担心的是会不会把输入栏原有的东西顶掉。查了槽的契约，它是 list 槽，注册要带 `id`。用一个全新的 `id`（`grill-send`）就会在那一行**并列新增**一个按钮，只有故意复用别人的 `id` 才会替换那一位。这是槽位系统里「加一个东西」和「取代一个东西」的分界线。

注册动作还要包在 `slots.inject` 里。槽位是别的插件声明的，本插件加载时目标槽可能还没就绪。`inject` 会等目标槽真正声明了才执行注册，声明方卸载时这次注册跟着撤销。注册本身是 Cordis 的注册即副作用，插件纤维一销毁，按钮自动消失，不用手动清理。

```ts
export function apply(ctx) {
  const slots = ctx.get('slots')
  if (slots === undefined) return
  slots.inject('conversation.input.right', () => slots.register({
    name: 'conversation.input.right',
    id: 'grill-send',
    order: 1,
  }, SendButton))
}
```

## 点按钮发消息：走 composer 自己的路

最初的想法是点按钮就调 Host 的某个 API 发一条消息。后来发现根本不用，会话作用域的槽组件，standard props 里直接有 `inputActions`，composer 自己发消息用的就是这一组动作。

```ts
inputActions.setDraft('')          // 先清掉正在打的字
inputActions.setDraft('grill me')  // 填入预设短语
inputActions.submit()              // 走和手打加回车完全相同的队列路径
```

`submit()` 之后的一切，adjudication、`session.prompt`、模型轮次，都是 dsh 本来就有的普通用户消息路径。插件只是替你把键盘敲了，没有发明自定义 remote，没有直接写会话事件，没有碰模型请求。这是 laundry 那篇纪律的延续，Client 要进对话只有一条正路，composer，不要绕过它造第二条发送通道。

## busy 保护：把决定抽成纯函数

输入机有 `adjudicating` 和 `submitting` 两个忙状态，提交在飞的时候再点按钮 `submit()`，会打断正在飞的提交。所以点击逻辑先抽成一个纯函数，忙时返回不可发

```ts
export function buildGrillSend(busy: boolean): string | null {
  if (busy) return null
  return GRILL_TRIGGER
}
```

忙时按钮 `disabled`。把决定抽成纯函数有个额外好处，它能在纯 Node vitest 里测，不需要浏览器，正好补上 Client 插件难验证的那块短板。

`setDraft('')` 必须在前。不先清空的话，`setDraft('grill me')` 会把预设短语**追加**到用户正在打的字后面。先清一次，按钮语义就是「替换草稿为预设短语」，符合直觉。

预设短语是产品契约。按钮发什么就是它的全部行为，`GRILL_TRIGGER` 被导成具名常量并用测试钉死，将来谁改了这句话，测试立刻红，比字符串散落在组件里可靠得多。

## 验证：动态插件，不重启不 build

Client 插件不能像 Host 插件那样拷进源码加 `--patch` 再重启 web 验证，这是最开始卡住的地方。解法是动态 Cordis 插件流程。在运行中的 GUI 会话里，用 `cordis_define` 把插件的 `apply` 主体作为 `code.client` 定义，纯 JS，没有 TS 没有 JSX，`cordis_run` 激活、界面批准。按钮立刻出现，点击实测「预设短语进入对话」。全程零重启零 build，验证完可以一键移除。

对「先验证想法」来说，这比走完整静态包流程快一个量级。验证通过之后，再决定要不要提升成正式包。

example 里那个纯 Node spec 测的是不依赖浏览器的部分，导出契约加 `buildGrillSend`，行为证明则落在动态插件的实跑里。README 写清了这个分工，两半谁负责什么一目了然。

完整源码在 `examples/grill-send-button/`，双语 README 里有两份复现步骤。

## 九月九日补记，装成标准包，装进另一个 profile

上面写到验证通过就停手，这一步后来补上了。九月九日按提案把这枚按钮从动态插件提升成独立标准包，文档里多了一份正式提案。打包把同一份 src 分成了两个半边，node 半边是空桩，让加载器有东西可挂，浏览器半边才是按钮本体。package.json 同时声明了两类身份，bundle 身份指向包自带的补丁文件，让 profile 知道装它等于叠一层配置，client 身份声明平台是 web，让浏览器的插件发现服务知道它的半边归谁管。双面声明齐了，包才既挂得上又找得到。

装包走的是官方安装命令。它把参数原样转给 profile 目录里的包管理器，装完自动把声明了 bundle 身份的依赖挂进 profile 的组合清单，这一步官方测试覆盖过，本地目录、git、npm 名都行。实测装完重启 web，界面却报插件加载失败，页面顶部一行 Failed to load plugins。查下来问题不在安装通道，装包、清单、浏览器启动图全都正常，卡在浏览器半边的产物格式上。web 的插件加载器只认一种浏览器产物，顶层必须调用一次登记接口，把插件 id 和工厂函数交出去，同一批脚本靠每个成员这样自报家门。我们之前把 src 直接编译成普通 ESM，只导出从不登记，于是整批加载失败。修法是给构建脚本加一层外壳，把编译器出的 CommonJS 主体包进那次登记调用，React 也从加载器的模块表里取，不再指望浏览器全局。改完重启，真实浏览器里按钮出现，可点可用，全程零报错。

这条链的细节，双面包长什么样、官方安装命令的精确语义、产物为什么必须登记，都整理进了 docs 的插件包分发一章，坑和验证结果同步进了示例的双语 README。

## 接下来该干嘛

动态验证和标准包分发现在都走完了，Client 侧值得继续练的还很多。往输入栏加按钮只是槽位系统最浅的一层，session 作用域、keyed 槽、composer 之外还有什么 standard props 可用，都还没摸。分发的另一头也留了尾巴，包里挂着门禁脚本和纯函数 spec，jsdom 级的组件测试一直没补，那是把按钮行为全部钉死在自动化里的最后一块。
