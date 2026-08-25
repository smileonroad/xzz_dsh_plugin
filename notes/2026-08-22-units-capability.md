# 2026-08-22 — units-capability，第一个 seam

## 事情是这样的

前几篇把插件的基本能力都过了一遍。第一篇写命令（/helloworld），给用户敲斜杠用的，第二篇写工具（sql_check），给模型用的，第三篇给工具装上配置、再打包分发（csv_query）。这几篇都是单插件，一个插件往注册表里塞一个定义就完事。

插件和插件之间怎么配合，我一直没练过。所以这篇给自己出了第四道题，做一个小而全的多插件协作，单位换算，名字叫 units-capability。

选单位换算是刻意的。这个功能人人都见过，但没人会认真搭架子，长度换长度就是查表乘系数，看起来没有技术含量。恰恰是这种没技术含量的东西，才能把 seam 本身看得清楚，不会被业务复杂度干扰。拿电商订单系统练的话，光业务字段就能绕晕人。

结果这道题卡了我小半天，卡点不在换算，在「插件怎么配合」这个前置问题。

## 为什么插件不能互相 import

写普通程序习惯了，A 要用 B 的功能，import 一下就完事。但 dsh 的插件禁止互相 import，一开始我觉得这条规矩不可理喻。不 import 怎么写代码，难道复制一份吗？

后来想明白，这条规矩是框架的根基，因为插件是热插拔的。如果 A 直接 import B，两个插件就焊死了，B 一卸载 A 就崩。改用服务键后，A 只依赖「一个叫 units 的东西存在」，至于它由谁提供、是内置还是配置注入，A 不关心。B 可以卸载、可以换实现，A 一行代码不用改。

想通这一点，这道题的解法就清楚了，搭一个带三个角色的 seam。

## 一个 seam，三个角色

第一个角色，**Definition，契约**。单独开一个包，里面没有一行插件代码，没有 name、没有 apply，永远不会进组合树。它只做三件事，定义契约类型、给 Context 增强类型、写纯换算数学。

```ts
// examples/units-capability/units/src/index.ts（节选）
export abstract class UnitsService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'units')   // ← 注册的魔法在这里
  }
  abstract list(): UnitInfo[]
  abstract convert(request: ConvertRequest): Promise<ConvertResult>
}
```

`super(ctx, 'units')` 这行是整条 seam 的轴心，Service 基类的构造函数会把子类注册成 ctx.units。这个基类在 deepseek-harness 的 `vendor/cordis/src/service.ts`，11 行开始，值得翻一翻。

换算数学就一条公式，`base = (value + offset) * factor`，先把值归到系统基准单位，再落到目标单位。线性单位就是 offset 为零的特例，温度的仿射偏移也由同一公式覆盖。错误也在这里定义，单位不认识抛 unknown-unit，跨系统硬换抛 cross-system，都带 code，消费方拿 code 分类处理，不用解析字符串。

写契约的感觉，像是盖房子先画图纸，图纸上不画砖，只画承重墙在哪。

第二个角色，**Provider，数据**。继承那个抽象类，把表填上，apply 里把自己作为嵌套插件挂进去。

```ts
// examples/units-capability/units-builtin/src/index.ts（节选）
export async function apply(ctx: Context) {
  await ctx.plugin(BuiltinUnits)   // 必须 await，原因见下面的坑
}
```

我写了两个 provider。units-builtin 带内置单位表，长度以米为基准、质量以千克、温度比较特殊（摄氏和华氏都带偏移）、数据是二进制倍数（1024 不是 1000）。units-custom 从插件配置读表，配了一个 Schemastery 的 schema，UnitInfo 有什么字段 Config 就有什么字段，镜像关系一目了然。因为数学全在 Definition 里，provider 自身不带逻辑，就是一张表。

第三个角色，**Consumer，消费方**。一个 unit_convert 工具，inject 声明依赖 tools 和 units，直接调 ctx.units.convert。

```ts
// examples/units-capability/tool-units/src/index.ts（节选）
export const inject = ['tools', 'units']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'unit_convert',
    // ...
    async execute(args) {
      const result = await ctx.units.convert({ value: args.value, from: args.from, to: args.to })
      return { ok: true, value: result.value, from: result.from, to: result.to }
    },
  }))
}
```

canonical value 这套在 sql_check 那篇讲过，这里只补一点，单位不认识返回的是 `ok: false` 加 error 结构，这是成功的结果不是异常。对模型来说那是可处理的信息，可以换单位重试，跟机器坏了没法处理是两码事。

三个角色齐了，分工很干净。想换数据，改一行配置，工具一个字都不用动。

## 三个坑和一个认知点

第一个坑，**服务键是扁平全局命名空间**。一个 ctx 里 units 只能注册一次，挂第二个 provider 直接抛 `service units has been registered`。一开始我还想两个 provider 一起挂、谁赢听谁的，结果框架根本不允许叠加，只能互换。cordis.yml 里那两个 provider 是注释互换的关系。

第二个坑，**嵌套插件必须 await**。provider 的 apply 里 `ctx.plugin(BuiltinUnits)` 必须 await。不 await 不会报错，注册错误会被吞掉，重复 provider 静默失败。错误被吞掉比报错难排查得多，这点测试里专门钉死了。

还有个认知点，跟坑无关但重要，**加载顺序是依赖驱动的，不是文件顺序**。cordis.yml 里 provider 行写在 tool 行上面只是可读性考虑，就算把 tool 行放前面，inject 声明的 tools 和 units 没齐，框架也不会提前调 apply。之前遇到的始终 PENDING 的插件，多半就是 inject 的东西没人提供。

## 测试，把 provider 参数当成被测 seam

测试装配延续系列的做法，挂真实服务、走真实边界，执行走 ctx.tools.execute，跟 agent 循环同一个入口。

最有意思的是把 provider 参数当成了被测的 seam。

```ts
// examples/units-capability/tests/units-capability.spec.ts（节选）
async function harness(provider: ProviderPlugin, config?: unknown): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  await ctx.plugin(provider as never, config as never)   // ← seam，换 provider
  await ctx.plugin(toolUnits)
  return ctx
}
```

同一个 harness，传内置 provider 能算 5 km 到 mi，传配置 provider、同一个工具一行没改，能算 2 smoot 到 sm，连温度的仿射偏移都算得对，零度摄氏换华氏是 32 度。

10 个用例，契约和数学、两个 provider、工具行为、错误 canonical 化、自动校验、重复 provider、presenter 纯度、Loader 安全导出，全绿。测试描述行为不描述正确性，这个原则系列反复说过，这次多了一层，**seam 本身就是被测对象**。provider 参数是变量，其他全是常量，一个 harness 函数换 provider 跑全套，测的是架构而不是某个函数算得对不对。

## 源码里撞见同款，官方也是这么做的

写完这个实战后我翻源码，发现 dsh 官方自己就是这套架构。

`packages/core/tools/src/index.ts` 里工具注册表的构造函数是 super(ctx, 'tools')，跟我的 super(ctx, 'units') 一模一样。`packages/skill/skill/src/index.ts` 里技能注册表 SkillRegistry，还是 super(ctx, 'skills')。再看 `vendor/cordis/src/service.ts` 的 Service 基类，原来所有服务的注册机制都长在它身上。

官方 skill 系统也是这个形状，注册表一个、provider 一堆（文件系统的、内置的、运行时注册的）、消费方两个（模型侧工具、用户侧界面），角色数量跟我练的 seam 对得上。这个发现单独写了一篇笔记（2026-08-22-dsh-skill.md），这里不展开。

整座 harness 就是一堆 seam 互相咬合，我练的这一条，是其中最小的一份样本。

## 教科书给结论，练习给手感

说到这，我想聊一个跟代码无关的点。

分层、解耦、依赖倒置，这些词学过编程的人都知道，但知道定义不等于写代码时手会往那里走。这次我是先卡住、再自己摸出这条路，然后才意识到教科书里写过。这个顺序很关键，**教科书给结论，练习给手感**，结论听完就忘，手感摸过就长在身上。以后再写插件，看到 inject 那一行，会自然想到依赖的是什么、谁在提供、能不能换掉。这就是 seam 的语感。

## 接下来该干嘛

想练这条缝的，可以搭一个自己的 seam，挑熟悉的领域，时区换算、货币汇率都行。先写 Definition（纯契约纯数学），再写 Provider，最后写 Consumer 工具，然后写一个测试让同一个工具服务两个 provider。

三个提醒。第一，Definition 别偷懒，类型和数学是整条 seam 的承重墙。第二，Provider 越薄越好，逻辑全在 Definition，provider 只是数据，薄到一张表就对了。第三，Consumer 只认键，别让它知道数据从哪来。

如果一开始把换算逻辑写进 provider 了也不用担心，测试会先发现，同一套行为换个 provider 对不上，自然就知道逻辑放错了层。

回到开头的问题。插件不能互相 import，不是限制，是用一条反直觉的规矩换来整座框架的热插拔自由。
