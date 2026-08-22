# 2026-08-22 — units-capability，第一个服务缝：Definition / Provider / Consumer

## 事情是这样的

前两篇写了 `/helloworld` 命令（给人用的）和 `sql_check` 工具（给模型用的）。这两个都是「单插件」：一个插件往注册表里塞一个定义就完事。

这篇不一样，我要做一个**多插件协作**的例子：一个单位换算能力，拆成三个插件角色，靠 `ctx.units` 这个服务键串起来。做完才真正理解 Cordis 那句「一切皆插件」的分量——不只是功能是插件，连**服务本身**都是插件，谁提供、谁消费，全靠键来对接。

## 为什么插件不能互相 import

这是我这次最大的认知更新。写普通程序，A 要用 B 的功能，`import B from './b'` 就完了。但 Cordis 里插件**禁止互相 import**，只通过服务键耦合：A 声明 `inject: ['units']`，框架就把 `ctx.units` 递给它。

为什么这么设计？因为插件是热插拔的。如果 A 直接 import B，那 A 和 B 就焊死了，B 卸载 A 也得跟着死。用服务键，A 只依赖「一个叫 units 的东西存在」，至于它到底是内置实现还是配置注入的，A 不在乎。

所以一个能力天然是**一条带三个角色的缝**：

```
Definition（契约）  ←  Provider（数据）   ←  Consumer（消费）
```

谁都不能 import 谁，只认键。

## 三角色，逐个拆

### Definition，一个没有 apply 的包

`units/src/index.ts` 里没有任何插件代码——没有 `name`，没有 `apply`，永远不进组合树。它只是个普通库，被另外两方 import。

它干三件事：定义契约类型（`UnitInfo`、`ConvertRequest`、`ConvertResult`）、声明服务键、写纯换算数学。

服务键的声明方式很有意思，用 `declare module` 增强 Context 的类型：

```ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    units: UnitsService
  }
}
```

TypeScript 层面 `ctx.units` 从此存在；运行时层面靠 Provider 的构造器真正注册。契约的关键是抽象类：

```ts
export abstract class UnitsService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'units')   // ← 注册的魔法在这里
  }
  abstract list(): UnitInfo[]
  abstract convert(request: ConvertRequest): Promise<ConvertResult>
}
```

`Service` 的构造函数就是注册点，传 `'units'` 就是往 ctx 上挂这个键。抽象类保证：契约由 Definition 定义，实现必须由 Provider 提供。

纯数学 `convertWithTable` 也放在这，一条公式打天下：

```ts
const base = (value + (fromUnit.offset ?? 0)) * fromUnit.factor
return base / toUnit.factor - (toUnit.offset ?? 0)
```

`offset` 处理仿射系统——温度就是仿射的，0°C 不是 0K。线性单位（长度、质量）offset 为 0，同一条公式自然覆盖。

### Provider，换数据不换逻辑

`units-builtin/src/index.ts` 是内置实现：一张静态表（长度/质量/温度/数据四个系统），一个继承 `UnitsService` 的子类，`apply` 里把自己作为嵌套插件挂进去：

```ts
export async function apply(ctx: Context) {
  await ctx.plugin(BuiltinUnits)
}
```

`units-custom/src/index.ts` 是同一套套路，只是表来自插件配置，配了个 Schemastery 的 `Config` schema。两个 Provider 的代码几乎一样，差异只在「数据从哪来」。

这就是缝的价值：**数学在 Definition，Provider 只是数据**。所以 cordis.yml 里换一行，能力的数据就整个换掉，Consumer 一个字都不用改：

```yaml
- id: units-builtin
  name: './units-builtin/src/index.ts'
# - id: units-custom          ← 想换表，注释掉内置、解开这个，再给 config.table
#   name: './units-custom/src/index.ts'
```

### Consumer，只认服务键的工具

`tool-units/src/index.ts` 是 `unit_convert` 工具，跟 sql-check-tool 一样用 `defineTool`，但 inject 多了一个：

```ts
export const inject = ['tools', 'units']
```

`tools` 是它要注册进的注册表，`units` 是它要调的服务。Cordis 会等两个服务都就绪才调 apply。工具本身不知道背后是内置表还是配置表，它只调 `ctx.units.convert`。

错误处理延续上一篇的哲学：领域错误不 throw。`UnitsError`（未知单位、跨系统）被 execute 捕获，转成 canonical 的 `{ ok: false, error: { type, message } }`——模型能读、能处理，而不是把整个工具调用炸掉。

## 四个必须记住的规则

**1. 服务键是扁平全局命名空间。** 一个 ctx 里 `units` 只能注册一次，再注册直接抛 `service "units" has been registered`。所以 cordis.yml 里那两个 provider 是**互换**关系，不是叠加关系。这跟工具注册表「同名工具不能注册两次」是同一哲学：全局命名空间，谁先占谁说了算。

**2. 嵌套插件必须 await。** 我在 provider 的 apply 里写 `await ctx.plugin(BuiltinUnits)` 是有讲究的。cordis 的插件加载走 fiber，如果你不 await，注册错误会被吞掉——重复 provider 会**静默失败**而不是响亮报错。测试里专门断言了这个问题：不 await，坏消息会变成好消息，调试地狱。

**3. 加载顺序由依赖决定，不是文件顺序。** cordis.yml 里 provider 行写在 tool 行上面，纯属可读性考虑。就算把 tool 行放前面，`inject: ['tools', 'units']` 也会让 cordis 等齐服务再 apply。这就是为什么「始终 PENDING 的插件通常缺服务提供方」——它 inject 的东西没人提供。

**4. 工具的 schema 依然免费进系统提示词。** Consumer 也是 `ctx.tools` 注册，所以 `unit_convert` 的 name/description/parameters 照样由 system-prompt 装配器流进模型上下文。这条缝没有破坏工具生态的任何免费福利。

## 测试：把 provider 参数当成被测接缝

装配模式跟前两篇一样，挂真实服务、走真实边界。但这次有个新玩法：**harness 的 provider 参数就是被测的接缝**。

```ts
async function harness(provider: ProviderPlugin, config?: unknown): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  await ctx.plugin(provider as never, config as never)   // ← 接缝：换 provider
  await ctx.plugin(toolUnits)
  return ctx
}
```

10 个用例，最有说服力的一组是：

- 同一个工具，挂内置 provider，`5 km → mi` 返回 3.106856；
- **同一个工具，零改动**，挂自定义 provider（配置注入含仿射偏移的表），`2 smoot → sm` 返回 3.4036、`0 Y → X` 返回 100（仿射 offset 生效）。

这直接证明缝是通的：换数据源只动 provider 行，Consumer 和数学都不需要知道。

其他用例延续系列哲学：契约与纯数学直接断言（`0°C → °F` 是 32）、错误分类成 canonical 值而非 throw、缺参数被自动校验拦下、重复 provider 响亮失败、presenters 纯函数（坏的 meta 返回 undefined 不炸）、Loader 安全导出（没有 `default` 导出、`name`/`inject` 形状正确）。

跑测试还是老命令：

```sh
pnpm exec vitest run examples/units-capability/tests/units-capability.spec.ts
```

## 挂 web 的方式

这次的例子是两行 patch（provider + tool），不再是一行。junction 相对路径方案跟前面一样，`units.patch.yml` 里写好了完整的注释和三种路径方案。挂进去之后重启 web 进程（HMR 发布版默认禁用），问模型 "convert 5 km to mi" 就能看到 `unit_convert` 被调用。

这次我没有跑真实模型的 web 端到端——测试已经通过 `ctx.tools.execute` 这个 agent 循环同款入口验证了行为，挂载路径也和前两篇已验证过的模式完全一致。如果你想自己补上这层，步骤就是上面那些。

## 接下来该干嘛

想练这条缝的，三步走。

第一步，先跑通前两篇的 helloworld 和 sql-check-tool，确保三件套和工具契约熟。第二步，把这个 units-capability 拷进 deepseek-harness，跑测试，然后把 cordis.yml 里那两个 provider 换着挂，观察工具行为不变、数据在变——这是理解「服务缝」最快的实验。第三步，自己写一个新的能力：先写 Definition（契约 + 纯逻辑），再写一个 Provider，最后写一个 Consumer 工具，从你熟悉的领域挑一个，比如时区换算、货币汇率。

命令给用户抄近道，工具给模型长手，服务给插件们搭桥——这三层都摸过一遍，dsh 的插件模型就算入门了。
