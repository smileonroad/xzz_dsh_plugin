# 第 6 章：组合与 HMR

> [← 总览](README.md) · 上一章：[第 5 章：配置](05-配置.md) · 下一章：[第 7 章：进入 harness](07-进入-harness.md)

> **路径约定**。下文 **📄 文件** 给的是**本仓库**里的源码位置，都在 [`01-learn-basics/examples/cordis-tutorial/`](../../examples/cordis-tutorial/) 下；**▶️ 运行** 给的是**拷进 deepseek-harness 之后**在该检出目录里敲的命令，同步方式见[总览的通用运行方式](README.md#通用运行方式)。

## 6.0 本章一句话

> 前五章都在讲「一个插件怎么写」；这一章讲**这张插件清单本身怎么被管理** —— 条目有身份（`id`）、可以被关掉（`disabled`）、可以嵌套（组）、可以各自隔离（`isolate`）；文件一改，[HMR](#63-hmr改文件就重载) 就地把插件换掉；而**所有失败都是静默的**，所以你得学会主动去查 fiber 状态。

| 主题 | 一句话 |
|---|---|
| `id` | 条目的**稳定身份**。不写 → 每次生成新的，HMR 视角里等于「先删后加」 |
| `disabled` | **保留条目，只不挂载**。改回来就复活，依赖它的 PENDING 插件自动跟上 |
| 组 | 一份**嵌套条目子列表**，作为一个单元挂载/卸载 |
| `isolate` | 给某个服务名**分配独立的 Symbol**，让两个组各拿一份实例 |
| HMR | 文件保存 → 卸载旧实例（effect 全部回卷）→ 加载新代码 |
| PENDING | 依赖的服务没人提供。**不是错误**，是合法状态 —— 也是「插件没输出」的头号原因 |

---

## 6.1 条目的元数据

教程说 `cordis.yml` 的条目「除了 `name` 和 `config`，还接受其他元数据」。同一条目上能挂的字段：

```yaml
- id: greeter          # 稳定身份
  name: './greeter.ts'
- id: consumer
  name: './consumer.ts'
  disabled: true       # 保留条目，跳过挂载
```

### 🧪 实验：`id` 决定条目身份

**📄 文件** `01-learn-basics/examples/cordis-tutorial/06-entry-id/cordis.yml`

```yaml
# alpha 显式给了 id；beta 没给。
- id: alpha
  name: './a.ts'
- name: './b.ts'
- id: ids
  name: './ids.ts'
```

**📄 文件** `01-learn-basics/examples/cordis-tutorial/06-entry-id/ids.ts`

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'ids'

// 把每个 loader 条目的 id 打出来。
// 显式写了 id 的条目 → id 就是那个字符串，跨运行稳定；
// 没写 id 的条目   → loader 每次生成一个新的随机 id。
export function apply(ctx: Context) {
  setTimeout(() => {
    console.log('  ── loader 条目 ──')
    for (const entry of ctx.loader.entries()) {
      console.log(`     id=${String(entry.options.id).padEnd(10)} name=${entry.options.name}`)
    }
  }, 300)
}
```

**▶️ 运行**（跑两次，对比 id）

```sh
cd tmp/cordis-tutorial/06-entry-id
node --import tsx ../../../vendor/cordis/bin.js    # 第 1 次
node --import tsx ../../../vendor/cordis/bin.js    # 第 2 次
```

**输出**

```
   alpha 加载
   beta 加载
  ── loader 条目 ──
     id=7eeca9b8   name=@deepseek-ai/cordis-plugin-include
     id=alpha      name=./a.ts
     id=a366c766   name=./b.ts
     id=ids        name=./ids.ts
   alpha 加载
   beta 加载
  ── loader 条目 ──
     id=673b8103   name=@deepseek-ai/cordis-plugin-include
     id=alpha      name=./a.ts
     id=4f444d06   name=./b.ts
     id=ids        name=./ids.ts
```

**读这张表**：

| 条目 | 第 1 次 | 第 2 次 | 稳定？ |
|---|---|---|---|
| `include`（bin.js 建的，没写 id） | `7eeca9b8` | `673b8103` | ❌ |
| `./a.ts`（写了 `id: alpha`） | `alpha` | `alpha` | ✅ |
| `./b.ts`（没写 id） | `a366c766` | `4f444d06` | ❌ |
| `./ids.ts`（写了 `id: ids`） | `ids` | `ids` | ✅ |

> ⭐ **这就是教程那句话的全部含义**：
>
> > 「不带该字段的 Cordis 配置项在每次读取时都会获得一个新生成的 id，所以只要配置文件发生任何编辑，即使自身文本未变，它也会被视为**先删除再添加**并重新挂载。」
>
> loader 比对配置的方式是 `oldMap[id]` vs `newMap[id]`（源码 `group.ts:67-68`）。
> 没写 `id` → 两次读到的 id 不同 → **在你眼里没改的那一行，在 loader 眼里是「旧的删掉、新的加上」** —— 插件被整个卸载重挂，所有 effect 回卷。

### 🧪 实验：`disabled` 保留条目、只不挂载

**📄 文件** `01-learn-basics/examples/cordis-tutorial/06-disabled/cordis.yml`

```yaml
- id: logger
  name: '@deepseek-ai/cordis-plugin-logger-console'
  config:
    levels:
      default: 3
- id: timer
  name: '@deepseek-ai/cordis-plugin-timer'
- id: hmr
  name: '@deepseek-ai/cordis-plugin-hmr'
  config:
    root: ['.']
- id: report
  name: './report.ts'
- id: greeter
  name: './greeter.ts'
  disabled: true      # ← 保留条目，只是不挂载
- id: consumer
  name: './consumer.ts'
```

`consumer.ts` 里写着 `export const inject = ['greeter']`，而 greeter 被关掉了。
`report.ts` 在 1 秒和 13 秒各打印一次所有 fiber 的状态。

**▶️ 运行**（`run.sh` 会在中途把 `disabled` 翻成 `false`）

```sh
cd tmp/cordis-tutorial/06-disabled && bash run.sh
```

**输出**

```
2026-09-22 16:36:53 [I] hmr watching [ '.' ]
   [1 秒后] report=ACTIVE  consumer=PENDING  TimerService=ACTIVE  Hmr=ACTIVE  ConsoleExporter=ACTIVE
2026-09-22 16:36:57 [D] hmr add detected at sedkyfXxk
2026-09-22 16:36:57 [D] hmr change detected at cordis.yml
   ✅ consumer 加载了：Hello, world!
2026-09-22 16:36:57 [D] hmr unlink detected at sedkyfXxk
   [13 秒后] report=ACTIVE  consumer=ACTIVE  TimerService=ACTIVE  Hmr=ACTIVE  ConsoleExporter=ACTIVE  greeter=ACTIVE  GreeterService=ACTIVE
```

**三件事一次看到了**：

1. **1 秒后**：`consumer=PENDING` —— 而且**注意列表里根本没有 `greeter`**。被 `disabled` 的条目**不产生 fiber**，它只是躺在 `cordis.yml` 里
2. 把 `disabled` 改成 `false` 并保存 → HMR 感知到 `cordis.yml` 变更 → **`consumer` 自己就加载了**（`✅ consumer 加载了：Hello, world!`）
3. **13 秒后**：`consumer=ACTIVE  greeter=ACTIVE  GreeterService=ACTIVE` —— 一路全绿

> ⭐ 第 2 点是这一节的重点：**你不需要手动做什么**。`consumer` 一直挂在 PENDING 上等着，提供方一出现，Cordis 自动把它拉起来。
> 这就是教程说的「改回原值后，插件以及所有因依赖其服务而处于 PENDING 的插件都会再次加载」。
>
> 📌 顺带解释了 `03-service-consumer-only/` 那个「静默 PENDING」的实验 —— **PENDING 不是死掉，是排队等**。

### ⚠️ 陷阱：全部 PENDING → 进程**静默退出**

把上一条推到极端：如果被 `disabled` 的恰好是唯一撑住事件循环的提供方呢？

**📄 文件** `01-learn-basics/examples/cordis-tutorial/06-disabled-silent-exit/cordis.yml`

```yaml
# 唯一能提供 timer 的条目被 disabled 了。
- id: timer
  name: '@deepseek-ai/cordis-plugin-timer'
  disabled: true
- id: needs-timer
  name: './needs-timer.ts'
```

**▶️ 运行**

```sh
cd tmp/cordis-tutorial/06-disabled-silent-exit
node --import tsx ../../../vendor/cordis/bin.js
echo $?
```

**输出**

```
（什么都没有）

0
```

**859ms 后进程自己结束，退出码 0，一个字都没打印。**

**为什么**：`needs-timer` 因为 `inject = ['timer']` 停在 PENDING；PENDING 的插件**不注册任何 effect**；于是事件循环里没有任何东西撑着 —— Node 该退就退了。看起来像「启动失败」，实际是「**启动成功，然后无事可做**」。

> ⚠️ 这是本章最阴的一个坑：**退出码 0 会骗过所有 CI 检查**。脚本前面套了 `set -e` 也不会拦。
>
> **排查手法**：把 [6.4](#64-诊断-pending) 的 `diagnose.ts` 加进 `cordis.yml`，它会告诉你谁在等。

### 🧪 实验：嵌套组是一个挂载/卸载单元

**📄 文件** `01-learn-basics/examples/cordis-tutorial/06-group/cordis.yml`

```yaml
- id: logger
  name: '@deepseek-ai/cordis-plugin-logger-console'
  config:
    levels:
      default: 3
- id: timer
  name: '@deepseek-ai/cordis-plugin-timer'
- id: hmr
  name: '@deepseek-ai/cordis-plugin-hmr'
  config:
    root: ['.']
# 嵌套的条目子列表：整个组是一个挂载/卸载单元
- id: group-a
  name: '@deepseek-ai/cordis-plugin-group'
  disabled: false
  config:
    - id: x
      name: './x.ts'
    - id: y
      name: './y.ts'
```

`x.ts` / `y.ts` 各自在挂载和卸载时打印一行（卸载用 `ctx.effect` 的 disposer）。

**▶️ 运行**

```sh
cd tmp/cordis-tutorial/06-group && bash run.sh
```

**输出**

```
2026-09-22 16:37:30 [I] hmr watching [ '.' ]
      → child-x 挂载
      → child-y 挂载
2026-09-22 16:37:34 [D] hmr add detected at sedHIjaAp
2026-09-22 16:37:34 [D] hmr change detected at cordis.yml
      ← child-y 卸载
      ← child-x 卸载
2026-09-22 16:37:34 [D] hmr unlink detected at sedHIjaAp
```

**组是「一个条目」**：只改 `group-a` 那一行的 `disabled`，两个子条目一起走。**卸载顺序是 y → x（逆序）** —— 和第 2 章 `02-disposer-order/` 验证过的规律一致。

**组怎么实现的**：`@deepseek-ai/cordis-plugin-group` 导出的 `Group` 继承 `EntryGroup`，它的 `config` 就是**一份条目列表**（`group.ts:116-129`）。

> ⚠️ **组内条目的 `id` 是全局唯一的**。两个组写同样的 `id`，后一个组会把条目从第一个组**搬走** —— 而且**不报错**：
>
> ```
> group-a: [ greeter, consumer ]     # 两个组都写了 id: greeter
> group-b: [ greeter, consumer ]
>           ↓
> group-a: [ ]                        # 条目被搬走了
> group-b: [ greeter, consumer ]
> ```
>
> 机制在 `group.ts:20-27`：`create()` 先按 id 去 `tree.store` 里找，**找到就复用那个 Entry 并改写它的 `parent`**。
> 我在搭这个实验时正好踩到了，输出是「只有 B 的提供方启动」。**别在组里手写重复 id。**

### 🧪 实验：`isolate` 让两个组各拿一份服务实例

**📄 文件** `01-learn-basics/examples/cordis-tutorial/06-isolate/cordis.yml`

```yaml
# 两个组各带一个 greeter 提供方。isolate 让每个组拥有【自己那份】
# greeter 服务的独立实例 —— 靠的是给服务名分配不同的 Symbol。
- id: group-a
  name: '@deepseek-ai/cordis-plugin-group'
  isolate:
    greeter: true            # ← 这个组独占一份 greeter
  config:
    - name: './greeter.ts'
      config:
        label: A
    - name: './consumer.ts'

- id: group-b
  name: '@deepseek-ai/cordis-plugin-group'
  isolate:
    greeter: true            # ← 另一个组独占另一份
  config:
    - name: './greeter.ts'
      config:
        label: B
    - name: './consumer.ts'
```

`greeter.ts` 的 `apply(ctx, config)` 会 `ctx.plugin(GreeterService, config)`，两个组传进去的 `label` 不同。

**▶️ 运行**（对照组 `06-no-isolate/` 是同一份配置去掉 `isolate`）

```sh
cd tmp/cordis-tutorial/06-isolate    && node --import tsx ../../../vendor/cordis/bin.js
cd ../06-no-isolate                  && node --import tsx ../../../vendor/cordis/bin.js
```

**输出**

```
# 06-isolate（有 isolate）
   greeter 提供方启动，label=A
   greeter 提供方启动，label=B
   consumer 看到的是 → [实例 A] Hello, world!
   consumer 看到的是 → [实例 B] Hello, world!

# 06-no-isolate（没有 isolate）
   greeter 提供方启动，label=A
   greeter 提供方启动，label=B
   consumer 看到的是 → [实例 A] Hello, world!
   consumer 看到的是 → [实例 A] Hello, world!
```

**对照非常干净**：

| | A 组的 consumer 看到 | B 组的 consumer 看到 |
|---|---|---|
| 有 `isolate` | 实例 A | **实例 B** ✅ 各看各的 |
| 没有 `isolate` | 实例 A | **实例 A** ❌ 都看 A |

**机制**：`isolate` 给服务名分配**不同的 Symbol**（`isolate.ts:31-37` 的 `realm.access`）：

```ts
access(key, create = false) {
  if (create) return this.store[key] ??= Symbol(`${key}${this.suffix}`)
  else return this.store[key] ?? Symbol(`${key}${this.suffix}`)
}
// LocalRealm.suffix = '#' + entry.options.id   → 如 greeter#group-a
// GlobalRealm.suffix = '@' + label            → 如 greeter@realmA
```

服务查找、`provide` 去重、`notify` 全都按这个 Symbol 走（`reflect.ts:287`：`this.ctx[symbols.isolate][name] ??= Symbol(name)`）。**Symbol 不同 = 互相看不见。**

`isolate` 的值有两种：

| 写法 | 效果 | 底层 |
|---|---|---|
| `isolate: { greeter: true }` | 每个**条目**（通常是组）一份 | `LocalRealm`，后缀 `#<entry.id>` |
| `isolate: { greeter: 'realmA' }` | 打了**同一个 label** 的条目共享一份 | `GlobalRealm`，后缀 `@realmA` |

> 📌 **写在哪一层？** 写在外层（组）上就够了 —— 子条目的 isolate map 是 `Object.create(parent的)`（`isolate.ts:98`），**继承**下去的。
>
> ⚠️ 这里没有自动命名空间。两个组用同样的 `id` 子条目、同样的服务名，**默认就是抢同一份** —— 所以才要 `isolate`。

**再验证一次「先注册的胜出」**：把对照组里两个组的顺序对调（B 先 A 后）：

```
   greeter 提供方启动，label=B
   greeter 提供方启动，label=A
   consumer 看到的是 → [实例 B] Hello, world!
   consumer 看到的是 → [实例 B] Hello, world!
```

两次都是**先跑的那个赢**（详见 [6.5 服务名撞车](#65-服务名撞车先注册的胜出后注册的静默-failed)）。

---

## 6.2 运行期改坏 `cordis.yml`：崩还是记日志？

「启动期模块解析失败会直接崩溃」这一点在 [1.6 两个故障实验](01-第一个插件.md#16-两个故障实验报错的动词不同) 已经实测过。这一节补上另一半：**运行期的增量更新是不是也只记日志？** 现在有了 HMR，可以实测了。

**📄 文件** `01-learn-basics/examples/cordis-tutorial/06-hmr-config-error/run.sh`

```sh
#!/usr/bin/env bash
# 运行期把 cordis.yml 改坏（指向不存在的模块），看进程是崩还是只记日志。
#
# 日志必须写到【被监视目录之外】—— HMR 的 root 是 ['.']，
# 写进本目录会被当成一次文件变更，触发额外的 reload。
set -u
cd "$(dirname "$0")"

LOG="${TMPDIR:-/tmp}/hmr-config-error.log"
cp cordis.yml cordis.yml.orig
cp hello.ts  hello.ts.orig
rm -f "$LOG"

timeout 16 node --import tsx ../../../vendor/cordis/bin.js > "$LOG" 2>&1 &
NODE_PID=$!

sleep 5
echo "───── ② 改坏 cordis.yml（加一个不存在的模块 ./nope.ts）─────"
printf -- "- id: broken\n  name: './nope.ts'\n" >> cordis.yml

sleep 5
echo "───── ③ 再改 hello.ts，看旧树是否还活着 ─────"
sed -i "s/hello is ACTIVE/hello is STILL ALIVE/" hello.ts

sleep 4
wait $NODE_PID 2>/dev/null
echo "node 退出码 = $?（124 = 被 timeout 杀掉，即进程一直活着没崩）"

echo "───── ④ 完整输出 ─────"
cat "$LOG"

mv cordis.yml.orig cordis.yml
mv hello.ts.orig  hello.ts
```

**▶️ 运行**

```sh
cd tmp/cordis-tutorial/06-hmr-config-error && bash run.sh
```

**输出**（省略中间的大段 stack）

```
hello is ACTIVE
2026-09-22 16:34:18 [I] hmr watching [ '.' ]
2026-09-22 16:34:22 [D] hmr change detected at cordis.yml
2026-09-22 16:34:22 [W] hmr config reload at E:\...\06-hmr-config-error\cordis.yml failed
2026-09-22 16:34:22 [W] hmr Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'E:\...\nope.ts' imported from E:\...\
                            at finalizeResolution (node:internal/modules/esm/resolve:275:11)
                            ...
2026-09-22 16:34:22 [W] hmr Error: failed to import loader entry broken (./nope.ts): Cannot find module 'E:\...\nope.ts' ...
                            at updateError (E:\...\vendor\loader\src\config\entry.ts:26:10)
                            at async EntryGroup.update (E:\...\vendor\loader\src\config\group.ts:71:24)
                            at async Include._apply (E:\...\vendor\include\src\index.ts:317:5)
2026-09-22 16:34:27 [D] hmr add detected at sedkT0agb
2026-09-22 16:34:27 [D] hmr change detected at hello.ts
2026-09-22 16:34:27 [D] hmr unlink detected at sedkT0agb
2026-09-22 16:34:27 [I] hmr reload plugin at hello.ts
hello is STILL ALIVE
```

**`node 退出码 = 124`** —— 被 `timeout` 杀掉的，也就是**进程从头到尾都活着**。

### 结论：同一份错误，两条路径两种命运

| 阶段 | 引用不存在的模块 | 退出码 | 恢复方式 |
|---|---|---|---|
| **启动期**（`bin.js` 的顶层 `await`） | **崩溃**，异常一路冒到顶层 | **1** | 修好文件重跑 |
| **运行期**（HMR 触发的 config refresh） | **只记日志**，`config reload ... failed` + 原始错误 | **0**（进程存活） | 旧树已回滚，**继续编辑即可** |

**判据：看有没有顶层 `await` 兜着。** 差异的根源在 `bin.js`：

```js
// vendor/cordis/bin.js:11
await ctx.loader.create({ name: '@deepseek-ai/cordis-plugin-include', config: { path: './cordis.yml' } })
//   ↑ 顶层 await：这里的 rejection 直接变成未捕获异常 → 进程退出
```

而运行期走的是 `Hmr.refreshConfig` 的 `try/catch`（`hmr/src/index.ts:305-316`）：捕获 → `logger.warn` → 继续。**同一份错误，两条路径两种命运。**

**第 ③ 步是这一节最关键的证据**：配置刷新失败之后，改 `hello.ts` **仍然能正常 reload**（`hello is STILL ALIVE`）。这说明 `EntryGroup.update` 的事务回滚（`group.ts:85-105`）**真的把旧树留下了** —— 配置改坏了不会让你丢掉整个进程，只是那次修改没生效。

---

## 6.3 HMR：改文件就重载

### 🧪 实验：改插件文件 → 自动重载

**📄 文件** `01-learn-basics/examples/cordis-tutorial/06-hmr/cordis.yml`

```yaml
- id: logger
  name: '@deepseek-ai/cordis-plugin-logger-console'
- id: timer
  name: '@deepseek-ai/cordis-plugin-timer'
- id: hmr
  name: '@deepseek-ai/cordis-plugin-hmr'
  config:
    root: ['.']
- id: hello
  name: './hello.ts'
```

**📄 文件** `01-learn-basics/examples/cordis-tutorial/06-hmr/hello.ts`

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'

export function apply(ctx: Context) {
  console.log('hello from my first plugin')
}
```

**▶️ 运行**（启动后 6 秒改文件，再等 6 秒）

```sh
cd tmp/cordis-tutorial/06-hmr
(timeout 14 node --import tsx ../../../vendor/cordis/bin.js > /tmp/hmr.log 2>&1 &)
sleep 6
sed -i "s/hello from my first plugin/hello from my EDITED plugin/" hello.ts
sleep 6
cat /tmp/hmr.log
sed -i "s/hello from my EDITED plugin/hello from my first plugin/" hello.ts   # 改回去
```

**输出**

```
hello from my first plugin
2026-09-22 16:28:12 [I] hmr watching [ '.' ]
2026-09-22 16:28:18 [I] hmr reload plugin at hello.ts
hello from my EDITED plugin
```

**旧实例先卸载（effect 全部回卷）→ 新代码加载 → `apply` 再跑一次。**

### ⚠️ 陷阱：HMR 的**全部告警默认看不见**

上面这个实验如果失败，你**看不到任何提示**。原因在日志级别：

```
vendor/cordis/src/logger.ts:22
export const enum LoggerLevel {
  ERROR = 0,
  INFO  = 1,
  WARN  = 2,
  DEBUG = 3,
}
// logger.ts:156
if (targetLevel < level) continue      // 默认 targetLevel = INFO = 1
```

**数字是倒序的：数字越小越严重。** 默认阈值取 `INFO = 1`，于是：

| 级别 | 数值 | `1 < level`？ | 默认可见？ |
|---|---|---|---|
| `error` | 0 | 否 | ✅ |
| `info` | 1 | 否 | ✅ |
| `warn` | **2** | **是** | ❌ **被丢掉** |
| `debug` | **3** | **是** | ❌ 被丢掉 |

**HMR 的所有失败路径走的都是 `logger.warn`** —— 也就是说，**默认配置下 HMR 坏了你完全不知道。**

**📄 文件** `01-learn-basics/examples/cordis-tutorial/06-logger-level/warn.ts`

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'warn'

export function apply(ctx: Context) {
  // 延后 1 秒，确保 logger-console 已经注册 ——
  // 条目是【并发】加载的（group.ts:71 的 Promise.allSettled），
  // 启动阶段的早期日志可能赶在 exporter 注册之前发出，直接丢失。
  setTimeout(() => {
    ctx.logger.error('error 级别')
    ctx.logger.info('info 级别')
    ctx.logger.warn('warn 级别')
    ctx.logger.debug('debug 级别')
  }, 1000)
}
```

**▶️ 运行**（同一个插件，只改 logger 的 `levels`；对照组是 `cordis.default.yml`）

```sh
cd tmp/cordis-tutorial/06-logger-level
node --import tsx ../../../vendor/cordis/bin.js                    # cordis.yml: levels {default: 3}
cp cordis.default.yml cordis.yml
node --import tsx ../../../vendor/cordis/bin.js                    # 默认级别
```

**输出**

```
# levels: { default: 3 }
2026-09-22 16:43:18 [E] warn error 级别
2026-09-22 16:43:18 [I] warn info 级别
2026-09-22 16:43:18 [W] warn warn 级别
2026-09-22 16:43:18 [D] warn debug 级别

# 默认级别（INFO）
2026-09-22 16:43:20 [E] warn error 级别
2026-09-22 16:43:20 [I] warn info 级别
```

**四行变两行 —— `warn` 和 `debug` 无声无息地消失了。**

**所以本笔记第 6 章的所有 HMR 实验都带着这段配置**：

```yaml
- id: logger
  name: '@deepseek-ai/cordis-plugin-logger-console'
  config:
    levels:
      default: 3
```

> ⭐ **两个实用推论**：
> 1. **排查 HMR 不生效时，第一件事是这个配置。** 否则你面对的是「改了没反应，也没有任何消息」
> 2. 你自己写的插件里，**「重要到必须看见」的消息用 `logger.error`，不要用 `logger.warn`** —— `warn` 在 cordis 的严重度序列里**比 `info` 还低**

> 📌 另一件容易困惑的事：**条目是并发加载的**（`group.ts:71` 的 `Promise.allSettled`）。所以启动阶段的早期日志可能赶在 `logger-console` 注册之前发出，**直接丢失**。我在验证时第一版 `warn.ts` 就是这样 —— 必须 `setTimeout` 延后 1 秒才看得见。

### 🧪 实验：把插件改成语法错误

上一节证明「配置改坏了不崩」。那**插件模块本身**呢？

**📄 文件** `01-learn-basics/examples/cordis-tutorial/06-hmr-reload-error/run.sh`（关键部分）

```sh
sleep 5
echo "───── ② 把 hello.ts 改成语法错误 ─────"
cat > hello.ts <<'TS'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'

export function apply(ctx: Context) {
  console.log('hello is ACTIVE'      // ← 缺一个右括号
}
TS

sleep 5
echo "───── ③ 改回合法代码，看能否恢复 ─────"
cp hello.ts.orig hello.ts
sed -i "s/hello is ACTIVE/hello is RECOVERED/" hello.ts
```

**▶️ 运行**

```sh
cd tmp/cordis-tutorial/06-hmr-reload-error && bash run.sh
```

**输出**（省略 stack）

```
hello is ACTIVE
2026-09-22 16:34:46 [I] hmr watching [ '.' ]
2026-09-22 16:34:51 [D] hmr change detected at hello.ts
2026-09-22 16:34:51 [W] hmr Error: Transform failed with 1 error:
                        E:\...\06-hmr-reload-error\hello.ts:7:0: ERROR: Expected ")" but found "}"
                            at failureErrorWithLog (E:\...\esbuild\lib\main.js:1748:15)
                            ...
2026-09-22 16:34:56 [D] hmr change detected at hello.ts
2026-09-22 16:34:56 [D] hmr add detected at sedbSNwvi
2026-09-22 16:34:56 [D] hmr change detected at hello.ts
2026-09-22 16:34:56 [I] hmr reload plugin at hello.ts
hello is RECOVERED
2026-09-22 16:34:56 [D] hmr unlink detected at sedbSNwvi
```

**退出码 124（进程存活）**，而且**改回合法代码后自动恢复**。

**源码对应**（`vendor/hmr/src/index.ts:491-500`）：

```ts
try {
  for (const [, { filename }] of reloads) {
    attempts[filename] = this.ctx.loader.unwrapExports(await this.ctx.loader.import(filename, this.getOuterStack))
  }
} catch (e) {
  handleError(this.ctx, e)     // ← 打成日志（esbuild 错误会带上 code frame）
  return rollback()            // ← 恢复模块缓存，旧插件继续跑
}
```

`handleError` 专门识别 esbuild 的 `BuildFailure`，会 `readFileSync` 出错文件、用 `@babel/code-frame` 画出上下文（`hmr/src/error.ts:11-36`）。

> ⭐ **HMR 的整体哲学：永远不因为你的代码写错而让进程死掉。** 两条失败路径（模块编译失败、配置刷新失败）都回滚 + 记日志。
>
> ⚠️ **但别忘了上一节的级别陷阱** —— 这两条路径用的都是 `logger.warn`。

> 📌 **顺带发现**：`sed -i` 会产生**三个**文件事件 —— `add <临时文件>`、`change hello.ts`、`unlink <临时文件>`。因为 `sed -i` 实际是「写临时文件 → 改名覆盖」。看到 `add sedXXXXXX` 这种随机名不用慌，是编辑器/工具的原子写行为。

---

## 6.4 诊断 PENDING

依赖驱动加载的另一面：**插件的 `inject` 指定了没人提供的服务，它就永远等着，不输出任何东西。**

**📄 文件** `01-learn-basics/examples/cordis-tutorial/06-pending-diagnose/needs-timer.ts`

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'needs-timer'
export const inject = ['timer']

export function apply(ctx: Context) {
  console.log('needs-timer loaded')
}
```

**📄 文件** `01-learn-basics/examples/cordis-tutorial/06-pending-diagnose/diagnose.ts`

```ts
import { FiberState, type Context } from '@deepseek-ai/cordis'

export const name = 'diagnose'

export function apply(ctx: Context) {
  setTimeout(() => {
    for (const runtime of ctx.registry.values()) {
      for (const fiber of runtime.fibers) {
        if (fiber.state === FiberState.PENDING) {
          console.log(`${fiber.name} is PENDING — a required service is missing`)
        }
      }
    }
  }, 500)
}
```

**📄 文件** `01-learn-basics/examples/cordis-tutorial/06-pending-diagnose/cordis.yml`

```yaml
- id: needs-timer
  name: './needs-timer.ts'
- id: diagnose
  name: './diagnose.ts'
```

**▶️ 运行**

```sh
cd tmp/cordis-tutorial/06-pending-diagnose
node --import tsx ../../../vendor/cordis/bin.js
```

**输出**

```
needs-timer is PENDING — a required service is missing
```

退出码 `0`。注意 `needs-timer loaded` **没有打印** —— `apply` 根本没跑。

`FiberState` 一共六个值（`vendor/cordis/src/fiber.ts:147-154`）：

```ts
export const enum FiberState {
  PENDING,    // 0 依赖没满足，等着
  LOADING,    // 1
  ACTIVE,     // 2 正常运行
  FAILED,     // 3 出错了（而且可能像 6.5 那样一声不响）
  DISPOSED,   // 4
  UNLOADING,  // 5
}
```

### 🧪 实验：补上提供方，PENDING 立刻转 ACTIVE

**📄 文件** `01-learn-basics/examples/cordis-tutorial/06-pending-fixed/cordis.yml`

```yaml
- id: timer
  name: '@deepseek-ai/cordis-plugin-timer'
- id: needs-timer
  name: './needs-timer.ts'
- id: dump-all
  name: './dump-all.ts'
```

`dump-all.ts` 把**所有** fiber 的名字和状态都打出来（不过滤）。

**▶️ 运行**

```sh
cd tmp/cordis-tutorial/06-pending-fixed
node --import tsx ../../../vendor/cordis/bin.js
```

**输出**

```
needs-timer loaded
  名字                                  状态
  Loader                               ACTIVE
  isolate                              ACTIVE
  Include                              ACTIVE
  needs-timer                          ACTIVE
  dump-all                             ACTIVE
  TimerService                         ACTIVE
```

> 📌 这就是教程说的「不加 PENDING 过滤条件进行迭代时，还会看到 loader 自身的插件（Loader、Include）处于 ACTIVE，因为配置文件本身也是通过插件挂载的」。
>
> 实测多出来一个 **`isolate`** —— 那是 loader 内部装的 isolate 辅助插件（`loader/src/index.ts:159` 的 `ctx.plugin(isolate)`），教程没提。

> ⭐ **「我的插件没输出」的排查顺序**：
> 1. `dump-all.ts` 看它的 fiber 在不在 → 不在 = 压根没被 `cordis.yml` 加载（检查 `name` 路径）
> 2. 在但 `PENDING` → `inject` 的服务没人提供
> 3. 在但 `FAILED` → 启动时抛异常了，**而且可能就是静默的**（翻回去看 6.5）
> 4. `ACTIVE` 却没输出 → 输出被日志级别吃掉了（6.3）

---

## 6.5 服务名撞车：先注册的胜出，后注册的静默 FAILED

两个插件抢同一个服务名，会发生什么？

**容易猜错的地方**：直觉上会以为「后注册的覆盖先注册的」，并且「撞车总会报错」。**两条都不对。**

**📄 文件** `01-learn-basics/examples/cordis-tutorial/06-duplicate-service/cordis.yml`

```yaml
# 两个条目抢同一个服务名 greeter —— 谁赢？会不会报错？
- id: logger
  name: '@deepseek-ai/cordis-plugin-logger-console'
  config:
    levels:
      default: 3          # 已经开到最详细了
- id: greeter-a
  name: './greeter.ts'
  config:
    label: A
- id: greeter-b
  name: './greeter.ts'
  config:
    label: B
- id: consumer
  name: './consumer.ts'
- id: dump-all
  name: './dump-all.ts'
```

**▶️ 运行**

```sh
cd tmp/cordis-tutorial/06-duplicate-service
node --import tsx ../../../vendor/cordis/bin.js
```

**输出**

```
   greeter 提供方启动，label=A
   greeter 提供方启动，label=B
   consumer 看到的是 → [实例 A] Hello, world!
  名字                                  状态
  Loader                               ACTIVE
  isolate                              ACTIVE
  Include                              ACTIVE
  consumer                             ACTIVE
  dump-all                             ACTIVE
  greeter                              ACTIVE
  greeter                              ACTIVE
  GreeterService                       ACTIVE
  GreeterService                       FAILED
  ConsoleExporter                      ACTIVE
```

**读这张表**：

| 观察 | 真相 |
|---|---|
| `consumer` 看到 **实例 A** | **先注册的胜出**，不是「后被前覆盖」 |
| **两个** `GreeterService`，一个 `ACTIVE` 一个 `FAILED` | 后注册的 `provide` **失败了** |
| 日志级别已经开到 `default: 3`，**一个字都没有** | 失败**完全静默** |
| 退出码 `0` | 从外部完全看不出来 |

**源码就在那里**（`vendor/cordis/src/reflect.ts:289-291`）：

```ts
if (this.store[key]) {
  throw new Error(`service "${name}" has been registered at <${this.store[key].fiber.name}>`)
}
this.store[key] = impl
```

**它确实抛了。** 只是这个 throw 发生在 `Service` 构造函数的 `fiber.effect()` 里面，**被记进那个 fiber 的 FAILED 状态，不往上传**。而 `greeter-b` 的**工厂插件**是 `ACTIVE` 的 —— 因为它的 `apply` 正常返回了：

```ts
export function apply(ctx: Context, config: Config) {
  console.log(`   greeter 提供方启动，label=${config.label}`)   // ← 这行照常打印
  ctx.plugin(GreeterService, config)                          // ← 这里的失败【不上传】
}
```

> ⚠️ **为什么这一条比前面几个静默失效更危险**：
>
> 前面几个（`Config` 挂错、`inject` 挂错、`!!js` 用在 `id`）好歹是**你自己写错了**。
> 这一条是**两个各自都写对的插件**碰到一起产生的，而且：
>
> - 后注册的插件**看起来完全正常**（`apply` 跑完了，日志也打了）
> - 只有一条 `dump-all` 才能发现那个 `FAILED`
> - **顺序决定谁赢** → 谁在 `cordis.yml` 里排前面，谁说了算
>
> 这就是教程反复要求你**给服务名加前缀**的真正理由：不是为了好看，是因为**改名是唯一的完全解决方案**。`isolate` 也能解决，但那是「隔离」而不是「避免撞车」—— 你得先意识到会撞。

> 📌 **别把「一个提供方跑通了」当成「多个提供方不会出事」** —— `03-service/` 那个实验只有一个提供方，所以从没暴露这个问题。

---

## 6.6 自测

**Q1**：`cordis.yml` 里一个条目**不写 `id`**，实际后果是什么？

<details>
<summary>参考答案</summary>

**每次读取都会生成一个新的随机 id**（实测：`./b.ts` 两次跑得到 `a366c766` 和 `4f444d06`）。

**后果**：loader 用 `oldMap[id]` vs `newMap[id]` 判断「哪个条目变了」（`group.ts:67-68`）。id 每次都不同 → **只要 `cordis.yml` 被编辑，即使那一行文本没动，在 loader 眼里也是「旧的删掉、新的加上」** → 那个插件被整个卸载重挂，**所有 effect 回卷**。

**什么时候无所谓**：一次性脚本、不跑 HMR 的场合。
**什么时候必须写**：跑 HMR，或者那个插件有需要保留的状态。

</details>

**Q2**：`disabled: true` 和「把那一行删掉」有什么区别？

<details>
<summary>参考答案</summary>

| | `disabled: true` | 删掉那一行 |
|---|---|---|
| 条目本身 | **保留**在 `cordis.yml` 里 | 没了 |
| 插件 fiber | **不创建**（实测：1 秒后 dump 里根本没有 `greeter`） | 不创建 |
| HMR 视角 | id 还在，只是不挂载 → **改回来就复活** | 算「删除」 |
| 依赖它的插件 | PENDING 等待 → **改回来自动加载** | 同样 PENDING 等待 |

**`disabled` 是「暂时关掉」，删掉是「不要了」。** 前者适合调试/灰度，后者适合清理。

> ⚠️ 而且 `disabled` 有个后果要留意：如果被关掉的恰好是唯一撑住事件循环的提供方，进程会**静默退出、退出码 0**（见 [6.1 的陷阱小节](#61-条目的元数据)）。

</details>

**Q3**：两个组各有一个 `greeter` 提供方，为什么不加 `isolate` 时两个消费者都看到同一个实例？

<details>
<summary>参考答案</summary>

因为**服务名前缀是空的**。Cordis 用 `ctx[symbols.isolate][name]` 作为服务在 `store` 里的 key（`reflect.ts:286-287`）：

```ts
this.ctx.root[symbols.isolate][name] ??= Symbol(name)
const key = this.ctx[symbols.isolate][name]
```

不加 `isolate` → 两次注册拿到**同一个 Symbol** → 是同一个槽位 → 第二个 `provide` 直接撞上 `if (this.store[key]) throw`。

加 `isolate: { greeter: true }` → 每个组一个 `LocalRealm`，后缀是 `#<entry.id>`（如 `greeter#group-a` / `greeter#group-b`）→ **两个不同的 Symbol** → 两个槽位 → 各看各的。

**验证过的对照组**：没有 `isolate` 时，把两个组的顺序对调，赢家也跟着换（A 先 → 都看 A；B 先 → 都看 B）。**顺序决定谁赢。**

</details>

**Q4**：启动时 `cordis.yml` 引用了一个不存在的模块，和运行期（HMR 触发）引用不存在的模块，结果一样吗？

<details>
<summary>参考答案</summary>

**不一样。**

| | 启动期 | 运行期 |
|---|---|---|
| 现象 | 异常冒到顶层，进程退出 | `[W] config reload at ... failed` + 原始错误 |
| 退出码 | **1** | **0**（进程存活） |
| 旧树 | —— | **回滚保留**，继续编辑即可恢复 |

**根源**：启动走 `bin.js:11` 的**顶层 `await`**（rejection → 未捕获异常 → 退出）；运行期走 `Hmr.refreshConfig` 的 `try/catch`（`hmr/src/index.ts:305-316`）。

**怎么证明运行期旧树真的活着**：配置刷新失败后，接着改 `hello.ts` —— 仍然正常 reload（实测输出 `hello is STILL ALIVE`）。说明 `EntryGroup.update` 的事务回滚（`group.ts:85-105`）起作用了。

</details>

**Q5**：HMR 明明在工作，但你的插件失败了你什么都没看到。最可能的原因？

<details>
<summary>参考答案</summary>

**日志级别。** `LoggerLevel` 是**倒序**的：

```ts
ERROR = 0, INFO = 1, WARN = 2, DEBUG = 3
// 过滤器：if (targetLevel < level) continue，默认 targetLevel = INFO = 1
```

`warn`(2) 和 `debug`(3) **默认都被丢掉**。而 **HMR 的所有失败路径用的都是 `logger.warn`**（`config reload ... failed`、`handleError`）。

**修**：给 logger-console 加

```yaml
config:
  levels:
    default: 3
```

**这个坑的严重性**：默认配置下 HMR 坏掉的表现是「改了没反应，也没有任何消息」—— 和「HMR 正常工作但我的代码没生效」**完全无法区分**。

> 📌 顺带：你自己排错时想留下的消息，**别用 `logger.warn`**。在 cordis 的严重度序列里它**比 `info` 还低**。

</details>

---

**本章一句话总结**：

> `cordis.yml` 是一棵**条目树** —— 条目有身份（`id`，不写就会话化）、能被关掉（`disabled`，改回来自动复活）、能嵌套（组，一个挂载单元）、能隔离（`isolate`，靠换 Symbol 实现）；HMR 靠「卸载 → 重载」替换插件，**且永不因你的代码错误而崩**。
>
> 但**本章的所有失败都是静默的**：`logger.warn` 默认看不见、重复服务名只让 fiber 变 `FAILED`、全 PENDING 会让进程退出码 0 地正常结束。**所以第 6 章真正的技能不是配置语法，而是「主动去 dump fiber 状态」。**

---
