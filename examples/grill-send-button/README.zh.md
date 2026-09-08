# grill-send-button

[English](README.md) | 中文

聊天输入栏里多出来的一个按钮。点它，预设短语 `grill me` 被填进输入框并发送，模型给出的回答和你亲手敲完回车一模一样。

这个按钮是一个**纯 Client 插件**，而这正是本实战的全部意义。之前的每一篇（helloworld-command → laundry-demo）都在 Node 进程里挂东西，命令、工具、服务、session 事件。这一篇的整个舞台第一次落在 web UI 上。它通过**槽位系统**找到自己的位置，从槽位组件的 standard props 里拿到会话给它的 `inputActions`，再借**composer 自己的发送路径**把消息送进对话。没有 Host API，没有自定义 remote，没有第二条发送通道。如果你有一个只属于界面的 dsh 想法，它就是长这样。

## 运行

本目录是**源码权威来源**。先拷贝进 deepseek-harness 源码树（那边可能有旧副本），再从 deepseek-harness 根目录操作：

```sh
# 1. 拷进 deepseek-harness 源码（本仓库是权威来源）
cp -r examples/grill-send-button ../deepseek-harness/examples/grill-send-button

# 2. 跑测试（5 个用例，进程内，不需要浏览器）
cd ../deepseek-harness
pnpm exec vitest run --config examples/grill-send-button/vitest.examples.config.ts examples/grill-send-button
```

spec 刻意保持纯 Node：它钉死导出的契约（`name` / `inject` / `GRILL_TRIGGER`）、`buildGrillSend` 里的 busy 闸门，以及 `slots` 服务缺席时 `apply` 的静默兜底。它做不到的是把按钮挂起来，往 `conversation.input.right` 注册需要活着的 web shell，任何 Node mount 都给不了。那一半靠运行中的 GUI 走动态 Cordis 流程验证，零重启零 build，见下文[在 GUI 里实测](#在-gui-里实测)。

## 设计

### list 槽位：新 `id` 是新增，不是替换

目标是 `conversation.input.right` 这个槽，聊天输入栏的工具行。它是 `list` 槽，往 list 槽注册的每一项都带 `id`。用一个全新的 `id`（这里是 `grill-send`），就在那一行原有控件旁边**并列新增**一个；只有故意复用别人的 `id` 才会顶掉那个位置。这个 `id` 就是「加一个东西」和「取代一个东西」的分界线，也是你不需要担心碰坏 composer 自带控件的理由。

### 注册动作包在 `slots.inject` 里

槽位属于 web shell（或别的插件），我的插件加载时它可能还没就绪。所以注册要包一层：

```ts
slots.inject('conversation.input.right', () => slots.register({
  name: 'conversation.input.right',
  id: 'grill-send',
  order: 1,
  label: () => 'Send grill',
}, SendGrillButton))
```

`inject` 等目标槽真正被声明了才执行回调，声明方卸载时这次注册也会跟着撤销。注册本身是 Cordis 的副作用，插件纤维一销毁按钮自动消失，不需要手动清理。

### 点击走的是 composer 自己的路

会话作用域的槽组件会收到 standard props，其中就有 `inputActions`，composer 自己打字和发送用的就是这组动作。所以点击逻辑没有任何花活：

```ts
inputActions.setDraft('')          // 先清掉正在打的字
inputActions.setDraft(message)     // 填入预设短语
inputActions.submit()              // 普通提交队列
```

`submit()` 把消息交给和人工回车完全相同的路径，adjudication、`session.prompt`、模型轮次一路走完。插件只是替你按了键。它不写 session 事件，不碰模型请求，不建第二条发送通道。这正是 laundry-demo 从另一侧教过的纪律，Client 只读持久 session 日志，不自己发明入口。

点击唯一要尊重的是输入机的忙状态。一条消息正在 adjudicate 或 submit（`input.phase` 是 `'adjudicating'` / `'submitting'`）时再补一发 `submit()` 会打断在飞的那条，所以忙时按钮 `disabled`。这个决定被抽成一个纯函数：

```ts
export function buildGrillSend(busy: boolean): string | null {
  if (busy) return null
  return GRILL_TRIGGER
}
```

> **深入：为什么决定要抽成纯函数** —— 一个同时读 `input.phase` 又调 `submit()` 的点击处理器离不开 React 和槽位运行时，永远没法在 Node 下跑。把*决定*从*副作用*里拆出来，整套 busy 契约就能在普通 spec 里测，组件只剩一层薄壳，负责禁用按钮和转发点击。这个接缝和 sql_check、csv_query 两篇里的 presenters 是同一个思路，纯逻辑在前，副作用留在边缘。

### `GRILL_TRIGGER` 是产品契约

按钮的全部行为就是它发出去的那句话，所以这句话被导成具名常量并用测试钉死。将来改短语，spec 立刻变红，比字符串散落在组件里可靠得多。

### 为什么 `src/index.ts` 一个 import 都没有

这个文件要同时伺候两个世界。下面动态流程里，`apply` 主体被当成纯 JS（`code.client`）贴进 GUI，模块 import 在那里无法解析，所以干脆没有；连 `React.createElement` 都是直接用而不是 import。静态打包时，同一个主体加上标准的 `name` / `inject` / `apply` 导出就变成仓库 Client 插件的 `apply`。你在 `src/index.ts` 里读到的，就是两个世界里真正跑的那份。

## 在 GUI 里实测

浏览器那一半靠运行中的 dsh web 会话走动态 Cordis 插件流程证明：

1. 打开 GUI 的会话，进动态插件界面（`cordis_define` 一个插件，`code.client` 填 `src/index.ts` 导出的那个对象，JS 口味，剥掉类型标注）。
2. `cordis_run` 激活，然后在 GUI 里批准插件。
3. composer 工具行出现 ⚡ Grill 按钮。空闲时点它，`grill me` 被提交，模型回答；消息在飞时点它，按钮是禁用的。
4. 用完移除插件，它注册的一切随之消失。

不重启、不 rebuild、不打包。这是「想法成不成」的快回路，也是上面的 spec 能保持这么小的原因。

## 分发

动态流程证明了行为，但什么都没发布。要把按钮交给别的 profile，得把本目录提升成标准 Client 插件包：`src/client/index.ts` 入口、`dsh.client` manifest 行、重新 build web bundle、重启 profile（发布版 web HMR 默认禁用，新插件必须重启进程）。包布局与 Client 插件机制见 `docs/plugin-package.md` 和 `docs/client-plugin.md`。

## 结构

```text
grill-send-button/
├── src/index.ts                    # 插件本体：契约 + apply（零 import）
├── tests/grill-send-button.spec.ts # 纯 Node spec，钉死契约
├── vitest.examples.config.ts       # 随示例分发的 vitest 配置（在 harness 里跑）
├── README.md / README.zh.md        # 本文件，双语
└── LICENSE
```

## 许可

MIT
