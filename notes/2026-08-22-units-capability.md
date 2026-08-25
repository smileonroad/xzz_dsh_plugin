# 2026-08-22 — units-capability，第一个 seam

## 事情是这样的

前几篇把插件的生命周期走得差不多了。第一篇写命令（/helloworld），给用户敲斜杠用的，第二篇写工具（sql_check），给模型用的，第三篇给工具装上配置、再打包分发（csv_query）。都是单插件，一个插件往注册表里塞一个定义就完事。

但插件和插件之间怎么配合，我一直没练过。

所以这篇我给自己出了第四道题，做一个小而全的多插件协作，单位换算，名字叫 units-capability。

为什么挑单位换算，因为它是那种人人都见过，但没人会认真搭架子的功能。长度换长度，查表乘系数，听上去一点技术含量都没有。但恰恰是这种没技术含量的东西，才能把seam 本身看得清清楚楚，不会被业务复杂度晃了眼。你要是拿个电商订单系统来练，光业务字段就能绕晕你。

结果这道题，卡了我小半天。

## 为什么插件不能互相 import

我写普通程序写习惯了，A 要用 B 的功能，import 一下，完事。但 dsh 的插件有个规矩，禁止互相 import。禁止？？？

不 import 怎么写代码，难道把代码复制一份吗？

我当时的第一反应是，这规矩有病吧。

后来我才明白，这条规矩不是有病，**是整座框架的命根子**。因为插件是热插拔的。如果 A 直接 import B，那 A 和 B 就焊死了，B 一卸载，A 直接炸。但用服务键，A 只依赖「一个叫 units 的东西存在」，至于它到底是谁提供的，内置的还是配置注入的，A 根本不在乎。B 可以卸载，可以换一个实现，A 一行代码不用改。

想明白这一层，我就知道这道题该怎么做了。我要搭一个 seam，一个带三个角色的 seam。

## 一个 seam，三个角色

第一个角色，**Definition，契约**。我单独开了一个包，里面没有一行插件代码，没有 name，没有 apply，永远不会进组合树。它只干三件事，定义契约类型、给 Context 增强类型、写纯换算数学。

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

super(ctx, 'units') 这行是整条 seam的轴心，Service 基类的构造函数会把子类注册成 ctx.units。顺带说一句，这个 Service 基类就在 deepseek-harness 的 vendor/cordis/src/service.ts，11 行开始，值得翻一翻。

换算数学也是纯的，base 等于 value 加 offset 再乘 factor，一条公式，先把值归到系统基准单位，再落到目标单位。线性单位就是 offset 为零的特例，温度的仿射偏移也靠它盖住。错也错得讲究，单位不认识抛 unknown-unit，跨系统硬换抛 cross-system，错误都带 code，消费方拿 code 就能分类处理，不用去抠字符串。

写契约的时候我有种感觉，这就像盖房子先画图纸，图纸上不画砖，只画承重墙在哪。

第二个角色，**Provider，数据**。继承那个抽象类，把表填上，apply 里把自己作为嵌套插件挂进去。

```ts
// examples/units-capability/units-builtin/src/index.ts（节选）
export async function apply(ctx: Context) {
  await ctx.plugin(BuiltinUnits)   // 必须 await，原因见下面的坑
}
```

我写了两个 provider，一个 units-builtin，内置单位表，长度是米打底，质量是千克打底，温度比较特别，摄氏和华氏都带偏移，数据是二进制倍数，1024 不是 1000。另一个 units-custom，从插件配置读表，配了个 Schemastery 的 schema，UnitInfo 里有什么字段，Config 里就有什么字段，镜像关系一目了然。因为数学全在 Definition 里，provider 自己不带任何逻辑，就是一张表。谁提供数据，谁就是 provider。

第三个角色，**Consumer，消费方**。一个 unit_convert 工具，inject 里声明依赖 tools 和 units，直接调 ctx.units.convert。

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

canonical value 这套我在 sql_check 那篇讲过，这里只补一个点，单位不认识返回的是 ok false 加 error 结构，这是成功的结果，不是异常。对模型来说那是可处理的信息，它可以换个单位重试，跟机器坏了没法处理是两码事。

写到这，三个角色齐了，我的感觉是，这玩意儿分工分得太干净了。想换数据，改一行配置，工具一个字都不用动。

## 三个坑和一个认知点

第一个坑，**服务键是扁平全局命名空间**。一个 ctx 里，units 只能注册一次。你想挂第二个 provider，直接给你抛 service units has been registered。我当时还想，两个 provider 一起挂，谁赢了听谁的，结果人家根本不允许你叠加，只能互换。cordis.yml 里那两个 provider 是注释互换的关系，不是叠加的关系。

第二个坑更阴，**嵌套插件必须 await**。provider 的 apply 里 ctx.plugin(BuiltinUnits) 这一行，必须 await。不 await 会怎样？不会报错，注册错误会被吞掉，重复 provider 会静默失败。坏消息变成没消息，这比报错恐怖多了。

还有个认知点，跟坑无关但挺重要，**加载顺序是依赖驱动的**，不是文件顺序。cordis.yml 里我把 provider 行写在 tool 行上面，纯属可读性考虑。就算把 tool 行放前面，inject 里声明的 tools 和 units 没齐，框架也不会提前调 apply。这就是为什么之前遇到那种一直 PENDING 的插件，多半是它 inject 的东西没人提供。

## 测试，把 provider 参数当成被测seam

测试这套装配延续系列的做法，挂真实服务，走真实边界，执行走 ctx.tools.execute，跟 agent 循环是同一个入口。

最有意思的是，我把 provider 参数当成了被测的seam。

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

同一个 harness，传内置 provider 进去，unit_convert 就能算 5 km 到 mi，传配置 provider 进去，同一个工具一行没改，就能算 2 smoot 到 sm。连温度的仿射偏移都能算对，零度摄氏换华氏是 32 度。

10 个用例，契约和数学一组，两个 provider 一组，工具行为一组，错误 canonical 化一组，自动校验一组，重复 provider 一组，presenter 纯度一组，Loader 安全导出一组，全绿。测试描述行为，不描述正确性，这个原则系列里反复说了，这次多了一层意思，**seam本身就是被测对象**，provider 参数是变量，其他全是常量，一个 harness 函数，换 provider，跑全套。这比写十个工具测试有价值多了，因为它在测架构，不是测某个函数算得对不对。

## 源码里撞见同款，官方也是这么做的

写完这个实战没多久，我发现了更劲爆的事，dsh 官方自己就是这套架构。

我翻了 packages/core/tools/src/index.ts，工具注册表那个类，构造函数里 super(ctx, 'tools')，跟我的 super(ctx, 'units') 一模一样。又翻了 packages/skill/skill/src/index.ts，技能注册表 SkillRegistry，还是 super(ctx, 'skills')。再看 vendor/cordis/src/service.ts 里那个 Service 基类，原来所有服务的注册魔法都长在它身上。

官方那个 skill 系统，注册表一个，provider 一堆（文件系统的、内置的、运行时注册的），消费方两个（模型侧的 skill 工具、用户侧的界面引用），连角色数量都跟我练的 seam对得上。这个发现我单独写了一篇笔记（2026-08-22-dsh-skill.md），这里不展开了。

整座 harness 就是一堆 seam互相咬合。我练的这一条，就是那堆 seam的最小样本。

## 教科书给结论，练习给手感

写到这，我想说点跑题的东西。

你可能觉得，这有啥，不就是接口和实现分离么，软件工程教科书里写了八百年的东西。

我非常理解这种感觉。分层、解耦、依赖倒置，这些词我听了十年，每一个都认识，合在一起就变废话。书上是没错的，问题是那些词不咬人。你背会了依赖倒置的定义，不等于写代码的时候手会往那里走。真正让手学会走路的，是卡一次壳，难受一晚上，第二天早上爬起来突然想通的那一下。

这次我是先卡住，卡到难受，再自己摸出这条路，然后才想起来，哦，教科书里写过。这个顺序真的很重要。**教科书给你的是结论，练习给你的是手感**，结论听完就忘，手感摸过就长在身上。以后我写任何一个插件，看到 inject 那一行，都会自动想到，我依赖的到底是什么，谁在提供它，它能不能被换掉。

这就是**seam 的语感**。

## 接下来该干嘛

如果你也在练 dsh 插件，我建议你也搭一个 seam试试，挑一个你熟悉的领域，时区换算，货币汇率，都行。先写 Definition，纯契约纯数学，再写一个 Provider，最后写一个 Consumer 工具。然后写一个测试，让同一个工具同时服务两个 provider，你就摸到那个手感了。

三个小提醒吧。丑话也说在前头，第一次搭 seam肯定会笨手笨脚，我搭到一半回过一次头，把 Definition 里的数学挪出来重写了一遍，因为一开始我把换算逻辑写进 provider 了。是测试先喊出来的，同一套行为，换个 provider 就对不上，你才意识到逻辑放错层了。这种错，搭一次就长记性。Definition 别偷懒，类型和数学是整条 seam的承重墙，它塌了全塌。Provider 越薄越好，逻辑全在 Definition，provider 只是数据，薄到一张表那种程度就对了。Consumer 只认键，别让它知道数据从哪来，它越傻，seam 越结实。

回到开头那个问题。插件不能互相 import，这规矩是不是有病？没病。它只是用一条最反直觉的规矩，**换来了整座框架的热插拔自由**。我练明白了。
