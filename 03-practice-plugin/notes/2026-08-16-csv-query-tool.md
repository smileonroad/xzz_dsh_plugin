# 2026-08-16 — csv-query-tool，给插件装上配置，再打包分发

## 事情是这样的

前两篇写了命令（/helloworld）和工具（sql_check），都是写完代码、挂进 web、跑通测试就收工。但一个插件的生命周期还没走完，还差两段，一段叫配置，一段叫分发。

配置的意思是，插件不能把行为写死，得让部署的人能调。分发的意思是，插件不能只活在你自己的机器上，得能装到别人的 profile 里。

这篇用 csv_query 工具把这两段一次走完。工具本身是解析 CSV 的，模型贴一段表格文本，它解析成 JSON 行返回。

## 配置，就是一个 schema 的事

dsh 的插件配置机制简单到让人意外。你导出两个同名的东西，一个类型一个 schema，框架就认了。

```ts
import Schema from '@deepseek-ai/schemastery'

export interface Config {
  defaultDelimiter: string
  maxRows: number
}

export const Config: Schema<Config> = Schema.object({
  defaultDelimiter: Schema.string().default(','),
  maxRows: Schema.number().default(1000),
})

export function apply(ctx: Context, config: Config) {
  // config 已经是校验过的，默认值也填好了
}
```

三个要点。

第一，`Config` 类型和 `Config` schema **同名导出**，这是约定，框架靠同名找到它们。

第二，**默认值写在 schema 字段上**，不是写在类型里。类型只是形状，schema 才是行为。框架加载插件时用 schema 校验配置、填默认值，然后作为第二个参数传给 apply。

第三，配置的来源有几个，cordis.yml 的 config 字段、测试里的 ctx.plugin(plugin, config)、bundle 层的 patch。框架统一处理。

我给 csv_query 设计了两配置项，defaultDelimiter（默认逗号）和 maxRows（默认 1000）。都是真实的行为开关，不是摆设。

## 配置和参数的分层，一个容易被忽略的设计

工具执行的时候，配置和参数怎么配合？我的设计是，调用方不传 delimiter 参数，就用配置的 defaultDelimiter，传了就覆盖。

```ts
const delimiter = args.delimiter ?? config.defaultDelimiter
```

一行代码，但它是分层思想的体现，配置默认 < 调用参数。配置是部署者定的，参数是调用者（模型）临时提的，后者优先。测试里专门写了两条用例钉死这个行为，一条验证配置生效，一条验证参数覆盖配置。

## CSV 解析器，手写的

csv_query 的核心是个手写的 CSV 解析器，零依赖。写之前我以为 CSV 简单，写了才发现坑都在引号里。

单元格可以带引号，引号里的逗号、换行都不是分隔符，两个连续引号表示一个转义引号。经典三连长这样。

```csv
id,note
a,"hello, world"
b,"line1
line2"
c,"say ""hi"""
```

解析状态机就三态，普通、引号内、引号结束，遇到引号要 peek 下一个字符判断是转义还是收尾。我第一版写岔了，用 indexOf 找下一个引号，结果永远找到第一个，改成索引循环才对了。这个 bug 被测试当场抓住，引号字段用例直接失败，修完才过。

另外几个边角，表头取第一行、空行跳过、BOM 剥离、行列数不一致报错且带行号。行列不一致这个最有价值，CSV 不齐是家常便饭，报出「第 2 行有 3 个单元格，表头有 2 个」模型才能修。

## 测试，13 个用例钉死行为

装配和 sql_check 一模一样，真实 SystemPrompt + ToolRuntime，走 ctx.tools.execute。区别在挂载插件时传配置。

```ts
await ctx.plugin(csvQueryTool, { defaultDelimiter: ';', maxRows: 5 })
```

13 个用例，覆盖注册和 Config schema、基本解析、引号字段、空行和 BOM、选列（忽略不存在的列名）、limit 截断（totalRows 报真实数）、行列不一致、空输入、配置分隔符生效、参数覆盖配置、maxRows 上限、缺参校验、presenter 纯函数。

有两个行为设计值得记一下。

limit 参数只裁剪返回的行，totalRows 始终报解析出的真实行数，truncated 标记告诉你被截了。模型看到 truncated 就知道总数可能不完整，不会拿截断数据当真。

maxRows 是解析器硬上限，解析时就停，防的是模型丢来一个几万行的文件把 host 拖垮。安全边界做成配置，部署的人自己权衡。

## 打包分发，一趟折腾的旅程

代码和测试都绿了，开始打包。官方教程的流程是，建一个 bundle 目录，package.json 声明 dsh.bundle，里面一个 patch 文件按包名引用插件，然后 dsh plugin add 装进 profile。

我按教程做，一路踩了三个坑。

第一个坑，pnpm 用目录名当依赖键。我建的目录叫 bundle，package.json 里包名是 dsh-csv-query-tool，结果 pnpm add 装进去，dependencies 里写的是 "bundle": "file:..."。键名不对，dsh 找不到包，报「declares no dsh.bundle」。解法是传 `dsh-csv-query-tool@file:路径`，显式指定包名。

第二个坑，源目录和构建目录不是同一个。我的源码权威在 xzz-dsh-plugin 仓库，构建用 deepseek-harness 里的 esbuild 跑，产物写到了 deepseek-harness 侧。结果 pnpm 安装时读到的目录里只有 index.js，没有 package.json，dsh.bundle 自然读不到。解法是把清单文件补齐到构建目录。

第三个坑，files 白名单。package.json 里写了 files: [index.js, cordis.patch.yml]，安装时确实只拷了这些，但 package.json 本身必须存在，它不在 files 里也必须在。

三个坑都过完，dsh plugin add 成功，profile 的 package.json 里 bundles 列表多了 dsh-csv-query-tool。dump-config 看到新 layer，插件按包名解析，不需要 junction，不需要绝对路径，不需要 --patch。

```yaml
# == dsh-csv-query-tool
- id: csv-query-tool
  name: dsh-csv-query-tool
```

## 端到端验证，bundle 里的工具真的能用

装进去只是第一步，还得证明这个从 bundle 加载的工具真的能被模型用起来。重启 web，新建会话，发了一条消息，让模型解析一段三行的 CSV 并算 age 列平均值。

等模型跑完一轮，界面上是完整的链路。

```
用户消息  请使用 csv_query 工具解析这段 CSV，并告诉我共有几行、age 列的平均值
    ↓
工具调用卡片  csv_query · name,age,city    ← 模型自主发起调用，传了 CSV 文本
    ↓
工具执行  返回 { ok: true, columns: [...], rows: [...], totalRows: 3 }
    ↓
模型回复  The csv_query returned "Parsed 3 columns, 3 rows"，然后算出平均值 30
```

模型读到的 Parsed 3 columns, 3 rows 正是 render 的输出，它拿着这个结果继续算平均值，链路是通的。

但这一轮还差一件事，配置没有参与验证。工具装进去时是默认配置，defaultDelimiter 和 maxRows 都是摆设，端到端里看不到它们。于是我做了第二轮验证，给 bundle 的 patch 加上配置，maxRows: 2，重新安装重启，再让模型解析那段三行的 CSV。

结果立刻不一样了。

```
工具执行  返回 { ok: true, columns: [...], rows: [2 行], totalRows: 2, truncated: true }
    ↓
模型回复  返回了 2 行数据，且被截断（truncated）了
```

工具返回的 render 文本是 Parsed 2 columns, 2 rows (truncated)，模型照着读出了「被截断」。三行数据只回来两行，这就是配置在真实链路里生效的证据，配置不是摆设。

这一轮还踩了个隐蔽的坑，值得记。pnpm 的 file: 依赖是拷贝不是链接，我改了 bundle 的 patch 文件，profile 里装着的还是旧副本，dump-config 里 config 一直不出现。重新 remove 再 add 一次，config 才进了组合树。改 bundle 之后必须重新安装，这是 file: 依赖的固定动作。

轨迹视图也确认了这一点，点进会话的轨迹面板，csv_query 的调用记录和 Parsed 3 columns, 3 rows 的结果按轮次排在事件序列里，跟前面 sql_check 验证时看到的一样。

到这一步，工具的验证闭环就是完整的三层，dump-config 看挂载（layer 在组合树里）、测试看行为（13 个用例）、web 端到端看真实模型轮次（模型自主调用并消费结果）。三层都过，才敢说这个 bundle 是能用的。

## 三种加载方式的适用场景

走完这一趟，三种加载方式在我脑子里彻底清晰了。

--patch 是临时调试，改一行配置重启一次进程，用完即弃，适合开发期。

junction 相对路径是开发期免绝对路径的方案，但机器相关，换台机器要重建 junction。

bundle 是分发，装进 profile 的 bundles 列表，之后每次启动自动生效，别的机器直接 dsh plugin add 就能装。它回答的是「怎么给别人用」，前两个回答的是「怎么自己跑」。

插件开发的完整生命周期到此闭环，写代码、测行为、验端到端、配参数、打包装、装 profile，一条线走完。
