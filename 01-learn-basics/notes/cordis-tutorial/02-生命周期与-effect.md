# 第 2 章：生命周期与 effect

> [← 总览](README.md) · 上一章：[第 1 章：你的第一个插件](01-第一个插件.md) · 下一章：[第 3 章：服务](03-服务.md)

> **路径约定**。下文 **📄 文件** 给的是**本仓库**里的源码位置，都在 [`01-learn-basics/examples/cordis-tutorial/`](../../examples/cordis-tutorial/) 下；**▶️ 运行** 给的是**拷进 deepseek-harness 之后**在该检出目录里敲的命令，同步方式见[总览的通用运行方式](README.md#通用运行方式)。

## 2.1 本章要解决的问题

插件会**卸载**。卸载的四种触发：

1. 修改配置
2. 热重载（HMR）
3. 显式资源释放（`fiber.dispose()`）
4. **所需服务消失**（`inject` 的依赖没了）

卸载之后，你注册过的东西**必须还回去** —— 否则就是泄漏。

## 2.2 effect = 「做一件事，附赠一个撤销按钮」

**理论**：

```
ctx.effect( execute )
             │
             ├─ execute：在【加载期间】立即运行，返回值应当是 disposer
             └─ disposer：在【卸载期间】运行，负责把 execute 做的事撤销掉
```

- `execute`（那个箭头函数体）在**加载期间立即运行**
- 它返回的 **disposer** 在**卸载期间运行**
- **对于生命周期与插件一致的资源，你永远不需要自己调用 disposer**

> 🔗 这就是架构笔记**附录 A** 里的「**可逆副作用**」（reversible effect）在 Cordis 里的正式形态。

### 🧪 验证实验：定时器的加载与卸载

**📄 文件** `01-learn-basics/examples/cordis-tutorial/02-lifecycle/lifecycle.ts`

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'lifecycle-demo'

function heartbeat(ctx: Context) {
  console.log('heartbeat plugin loading')
  ctx.effect(() => {
    const timer = setInterval(() => console.log('tick'), 200)
    return () => {
      clearInterval(timer)
      console.log('heartbeat cleaned up')
    }
  })
}

export function apply(ctx: Context) {
  // 挂载一个子插件，并保留它的 fiber 以便稍后销毁
  const fiber = ctx.plugin(heartbeat)
  // 这个演示用的定时器本身也是一个 effect：如果本插件先被卸载，
  // 待触发的回调会被取消，而不是在一个已死的应用上触发。
  ctx.effect(() => {
    const timer = setTimeout(async () => {
      await fiber.dispose()
      console.log('disposed')
      process.exit(0)
    }, 700)
    return () => clearTimeout(timer)
  })
}
```

**📄 文件** `01-learn-basics/examples/cordis-tutorial/02-lifecycle/cordis.yml`

```yaml
- name: './lifecycle.ts'
```

**▶️ 运行**

```sh
cd tmp/cordis-tutorial/02-lifecycle
node --import tsx ../../../vendor/cordis/bin.js
```

**输出**

```
heartbeat plugin loading
tick
tick
tick
heartbeat cleaned up
disposed
```

**结论**（按输出顺序读）：

| 输出行 | 发生了什么 |
|---|---|
| `heartbeat plugin loading` | 子插件的 `apply` 开始执行 |
| `tick` × 3 | 定时器在跑（200ms 一次，约 700ms 内 3 次） |
| `heartbeat cleaned up` | ⭐ **`fiber.dispose()` 触发了 disposer** —— 没有人手动调它 |
| `disposed` | 父插件继续执行到下一行 |

**关键**：`heartbeat cleaned up` 这一行是**白送的**。子插件的 `apply` 里从没写过「卸载时清定时器」—— 它只是把清理函数**交出去**了。`fiber.dispose()` 时 Cordis 自动执行了它。

> ⚠️ 这个实验也演示了一个**反例陷阱**：那个 `setTimeout` 本身也必须包在 `ctx.effect` 里。如果不包，父插件被销毁后这个定时器仍会触发 —— 它会在一个**已经死掉的 ctx** 上调用 `fiber.dispose()`。这正是 2.6 判据要防的东西。

## 2.3 源码印证：effect 的四条契约

`vendor/cordis/src/fiber.ts:402-409` 的文档注释：

```
* `execute` runs immediately; the disposers it produces are collected and
* run (in reverse order) either when the returned disposer is called or
* when the fiber unloads, whichever comes first. Calling the disposer twice
* is a no-op. Throws `CordisError('INACTIVE_EFFECT')` if the fiber is
* already disposed, and `TypeError` if `execute` returns an invalid shape.
```

拆成四条，每条都有源码对应：

| 契约 | 源码位置 | 含义 |
|---|---|---|
| `execute` **立即**运行 | — | 不是「等加载完」，是**同步**执行 |
| disposer **逆序**运行 | `fiber.ts:431` `disposables.splice(0).reverse()` | 后注册的先撤销 |
| 重复调用是 **no-op** | `fiber.ts:428` `if (disposing) return disposalTask` | **幂等**，可放心调用 |
| 对已 dispose 的 fiber 调用会**抛错** | `fiber.ts:419-422` | 防止在死掉的插件上注册 |

最后一条的源码：

```ts
effect(execute: () => Effect, label = 'anonymous'): any {
  this.assertActive()
  if (this.state === FiberState.UNLOADING) {
    throw new CordisError('INACTIVE_EFFECT')
  }
```

> 🔗 这条契约正是 `settings` 的 `installSection` 里那个 `isUnloading(owner)` 检查存在的原因（见 [2.7](#27-回扣settingsinstallsection-里的那个-effect)）。

## 2.4 ⭐ Fiber 状态机

**理论**：`vendor/cordis/src/fiber.ts:147-154`：

```ts
export const enum FiberState {
  PENDING,
  LOADING,
  ACTIVE,
  FAILED,
  DISPOSED,
  UNLOADING,
}
```

> ⚠️ **枚举里的排列不是状态转换顺序** —— 新增状态时只能追加，所以 `UNLOADING` 排在 `DISPOSED` 后面。真正的转换图看文档：

```
PENDING ──▶ LOADING ──▶ ACTIVE ──▶ UNLOADING ──▶ DISPOSED
               │
               └──▶ FAILED
```

| 状态 | 含义 | 你会怎么遇到它 |
|---|---|---|
| **PENDING** | 已声明，但 `inject` 的服务**还没到** | 「为什么我的插件没输出」← [第 6 章](06-组合与-HMR.md) |
| LOADING | `apply` 正在运行 | |
| ACTIVE | `apply` 已完成 | 正常态 |
| FAILED | `apply` 或配置校验抛异常 | 1.6 实验 A |
| UNLOADING | disposer 正在运行 | |
| DISPOSED | 全部拆除完毕 | |

> 🔗 **回扣**：你上一节学的 `ctx.inject` 里那个「休眠的分店」，就是这里的 **PENDING**。同一个状态，两种说法。

### 🧪 验证实验：用三个实验把状态「看见」

这些状态没有公共 API 直接打印，但**每个状态都有可观测的外部表现**：

| 状态 | 怎么造出来 | 观测到的现象 | 实验 |
|---|---|---|---|
| **PENDING** | `inject` 的服务没提供 | **完全静默**，退出码 0 | `03-service-consumer-only/` |
| **ACTIVE** | 正常加载 | 有输出，退出码 0 | `01-first-plugin/` |
| **FAILED** | `apply` 里 throw | 有错误 + 退出码 1 | `01-error-apply/` |
| **UNLOADING → DISPOSED** | `fiber.dispose()` | disposer 里的日志打出来 | `02-lifecycle/` |

**结论**：**PENDING 和 FAILED 的外观截然相反，但都很容易被误读**。

- PENDING 看起来像「成功但什么都没干」（静默 + 退出码 0）→ 最迷惑，[第 6 章](06-组合与-HMR.md)专治
- FAILED 看起来像「崩了」→ 最好排查

---

## 2.5 ⭐ 逆序 + 并发（教程的「顺序注意事项」）

**理论**：这是本章最精妙、也最容易读错的一点。把两段源码拼起来看：

```ts
// ① DisposableList.clear() —— 逆序返回
//    vendor/cordis/src/utils.ts:27-31
clear() {
  const values = [...this.map.values()]
  this.map.clear()
  return values.reverse()          // ← 逆序
}

// ② Fiber._unload() —— 并发启动
//    vendor/cordis/src/fiber.ts:675-679
private async _unload() {
  await Promise.all(this._disposables.clear().map(async (dispose) => { ... }))
  //                ↑ 逆序返回                    ↑ Promise.all = 并发
}
```

**所以准确的说法是**：

> disposer 按注册的**逆序**「**启动**」；但一旦启动，多个**异步** disposer 是**并发**跑的 —— 完成顺序不确定。

画成图（假设注册了 A、B、C 三个**耗时不同**的异步 disposer）：

```
时刻 0     C 启动 ────────┐
           B 启动 ───┐    │   ← 三个几乎同时开始（逆序启动）
           A 启动 ──────┐│  │
                       ││  │
时刻 ?     B 结束 ◀────┘│  │   ← 谁先结束？看谁快，不看注册顺序 ❗
时刻 ?     A 结束 ◀─────┘  │
时刻 ?     C 结束 ◀────────┘
```

### 🧪 验证实验：逆序启动，但完成顺序看耗时

**📄 文件** `01-learn-basics/examples/cordis-tutorial/02-disposer-order/disposer-order.ts`

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'disposer-order'

const t0 = Date.now()
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const stamp = () => `+${String(Date.now() - t0).padStart(4, ' ')}ms`

/** 被观察的子插件：注册三个耗时不同的 disposer */
function worker(ctx: Context) {
  const register = (tag: string, ms: number) => {
    ctx.effect(() => {
      console.log(`  ${stamp()}  注册 ${tag}（disposer 耗时 ${ms}ms）`)
      return async () => {
        console.log(`  ${stamp()}  ${tag} 清理【开始】`)
        await wait(ms)
        console.log(`  ${stamp()}  ${tag} 清理【完成】`)
      }
    })
  }

  // 注册顺序：A → B → C，耗时 90 / 10 / 50
  register('A', 90)
  register('B', 10)
  register('C', 50)
}

export function apply(ctx: Context) {
  const fiber = ctx.plugin(worker)

  ctx.effect(() => {
    const timer = setTimeout(async () => {
      console.log(`\n  ${stamp()}  ── 开始卸载 ──`)
      await fiber.dispose()
      console.log(`  ${stamp()}  ── 卸载结束（总耗时 = 最慢的那个，说明是并发跑的）──`)
      process.exit(0)
    }, 200)
    return () => clearTimeout(timer)
  })
}
```

**📄 文件** `01-learn-basics/examples/cordis-tutorial/02-disposer-order/cordis.yml`

```yaml
- name: './disposer-order.ts'
```

**▶️ 运行**

```sh
cd tmp/cordis-tutorial/02-disposer-order
node --import tsx ../../../vendor/cordis/bin.js
```

**输出**

```
  +   1ms  注册 A（disposer 耗时 90ms）
  +   1ms  注册 B（disposer 耗时 10ms）
  +   2ms  注册 C（disposer 耗时 50ms）

  + 210ms  ── 开始卸载 ──
  + 212ms  C 清理【开始】
  + 212ms  B 清理【开始】
  + 212ms  A 清理【开始】
  + 226ms  B 清理【完成】
  + 277ms  C 清理【完成】
  + 312ms  A 清理【完成】
  + 313ms  ── 卸载结束（总耗时 = 最慢的那个，说明是并发跑的）──
```

**结论**（三条，缺一不可）：

| 观察 | 数据 | 证明了 |
|---|---|---|
| **启动顺序是 A→B→C 的逆序** | 卸载时 `C, B, A` 依次【开始】 | ⭐ **逆序**（`values.reverse()`） |
| **三个【开始】落在同一毫秒** | 全是 `+212ms` | ⭐ **并发**（`Promise.all`，不是 await 循环） |
| **完成顺序是 B→C→A** | 10ms < 50ms < 90ms | ⭐ **完成顺序 = 耗时顺序，与注册顺序无关** |
| **总耗时 ≈ 100ms** | 212ms → 313ms | 若是串行，应是 90+10+50 = **150ms** |

**第 3 条是关键**：B 最先【完成】，尽管它在注册顺序里排在**中间**。如果你是靠 `await` 一个个来的，完成顺序必然是 C→B→A。**它是 B→C→A，所以确实是并发。**

### 实践结论（教程原话）

> 如果拆除步骤**必须按顺序**执行，请把它们放在**同一个** disposer 中，并在其中**依次 await** 每步完成。

```ts
// ❌ 不可靠：两个独立 effect，拆卸顺序不确定
ctx.effect(() => { const srv = listen(); return () => srv.close() })
ctx.effect(() => { const db = connect(); return () => db.close() })

// ✅ 可靠：一个 effect，内部显式串行
ctx.effect(() => {
  const srv = listen()
  const db = connect()
  return async () => {
    await srv.close()      // ← 先停服务（不再接新请求）
    await db.close()       // ← 再关数据库
  }
})
```

真实项目里很关键 —— 例如 HTTP 服务必须先停止接收请求，再关闭数据库连接；反了就会在新请求进来时报错。

## 2.6 最重要的实践：你**已经**不需要写 `ctx.effect` 了

教程第 86 行：

> 你**很少**需要亲自编写 `ctx.effect()`，因为内置注册 API 本身已经是 effect。

| API | 卸载时自动发生什么 |
|---|---|
| `ctx.on(event, listener)` | 监听器被移除（[第 4 章](04-事件.md)） |
| `ctx.plugin(child)` | 子插件随父插件 dispose，**递归** |
| 服务注册（`super(ctx, 'name')`） | 服务被注销 |
| `ctx.tools.register(...)` 等 harness 注册表 | 返回的 disposer 自动附着到调用插件（第 7 章） |

### 判据（记住这个就够了）

```
你要用的资源，Cordis 认识吗？
├─ 认识（事件 / 子插件 / 服务 / 注册表）
│    → 直接用，自动清理 ✅
└─ 不认识（定时器 / 网络连接 / 文件 watcher / 原生句柄）
     → 必须自己包 ctx.effect() ⚠️
```

「不认识」的资源有个共同特征：**它们绕过了 `ctx` 直接对外界产生了副作用**。

### 🧪 验证实验：`ctx.plugin` 的自动清理

`02-lifecycle/` 已经证明了一半：`ctx.plugin(worker)` 挂上的子插件，在 `fiber.dispose()` 时自动跑完了它自己的 disposer —— **子插件的清理不需要父插件操心**。

**▶️ 复用运行**

```sh
cd tmp/cordis-tutorial/02-lifecycle
node --import tsx ../../../vendor/cordis/bin.js
```

**关键输出行**

```
heartbeat cleaned up      ← 子插件的 disposer 自动执行
```

**结论**：父插件里**没有一行**清理子插件的代码 —— 它只做了 `ctx.plugin(heartbeat)`。**「Cordis 认识的资源」确实不需要你管。**

完整验证「事件监听器也自动清理」需要等到 [第 4 章](04-事件.md)（`ctx.on`），第 3 章的 PENDING 实验会给出另一半证据。

## 2.7 回扣：`settings.installSection` 里的那个 effect

现在回头看那段代码，应该完全通了：

```ts
this.ctx.effect(() => () => {
  // Losing the provider leaves the consumer running; unloading the
  // consumer does not, so only the former needs fallback work.
  if (isUnloading(owner)) return
  hooks.setSource(() => entry)
  hooks.onChange()
})
```

### 为什么它的 disposer 是「空参数」的？

注意形状：`ctx.effect(() => () => {...})` —— 外层做的是**空操作**，只返回内层函数。

因为这里要表达的是：

> **「什么都不做」这个动作，本身需要一个撤销按钮。**

它不创建资源，它创建的是**一个状态回退的承诺**：settings 提供方卸载时 → 把 source 降级回 `entry`。

> 🔗 这就是**可逆副作用**最纯粹的形态 —— 不是「申请-释放」资源，而是「**改变状态-恢复状态**」。

### `isUnloading(owner)` 在防什么

对应注释的两句话：

- **「失去提供方时消费者仍在运行」** → 需要回退 ✅ → 执行 `setSource(() => entry)`
- **「消费者自身卸载时则不然」** → 消费者整个都要没了，回退没意义 → `return` 跳过

这也正好呼应 2.3 的第四条契约：**不要在正在拆除的东西上做注册/撤销操作**。

## 2.8 自测

**Q1**：我注册了两个 effect，第一个注册的是「关闭数据库」，第二个是「停止 HTTP 服务」。卸载时会怎样？

<details>
<summary>参考答案</summary>

**逆序启动、并发运行**：

- **启动顺序**：先启动「停止 HTTP 服务」，再启动「关闭数据库」（逆序 ✅）
- **完成顺序**：**不确定** —— 两者并发跑，谁先完成取决于各自的耗时

所以「先停服务、再关库」这个**因果依赖**并没有被保证 —— 只是启动顺序对了，但两个操作重叠执行期间仍可能出问题。

**自己验证**：把 `02-disposer-order/disposer-order.ts` 里的耗时改成一样，你会看到完成顺序变得**不稳定** —— 多跑几次结果可能不同。这就是「完成顺序不确定」的直接体验。

**正确做法**：合并成一个 effect，在里面显式 `await`：

```ts
ctx.effect(() => {
  const srv = listen()
  const db = connect()
  return async () => {
    await srv.close()
    await db.close()
  }
})
```

</details>

**Q2**：下面哪些**必须**手写 `ctx.effect()`？

```
A. ctx.on('session/event', handler)
B. const t = setInterval(poll, 1000)
C. ctx.plugin(childPlugin)
D. super(ctx, 'myService')
E. const w = fs.watch(path, cb)
F. ctx.tools.register(myTool)
```

<details>
<summary>参考答案</summary>

**只有 B 和 E 需要。**

| 项 | 需要手写？ | 原因 |
|---|---|---|
| A `ctx.on` | ❌ | 内置注册 API，监听器自动移除 |
| B `setInterval` | ✅ **需要** | Cordis 不认识定时器 |
| C `ctx.plugin` | ❌ | 子插件自动随父 dispose（`02-lifecycle/` 已验证） |
| D `super(ctx, ...)` | ❌ | 服务注册本身就是 effect |
| E `fs.watch` | ✅ **需要** | Cordis 不认识 watcher |
| F `ctx.tools.register` | ❌ | harness 注册表会自动附着 disposer |

判据：**这个资源是经过 `ctx` 建立的吗？** 不是就必须自己包。

</details>

**Q3**：为什么对已经 dispose 的 fiber 调用 `ctx.effect()` 要**抛异常**，而不是静默忽略？

<details>
<summary>参考答案</summary>

因为**静默忽略会产生泄漏**。

如果允许在死掉的 fiber 上注册 effect，那么这个 effect 的 disposer **永远不会被调用** —— 它不属于任何活着的清理链。资源就此泄漏，而且**没有任何症状**，直到很久以后才爆发。

抛 `INACTIVE_EFFECT` 是把「必然的泄漏」变成「**立刻可见的崩溃**」。

这是 Cordis 的一贯风格 —— 回看第 1 章：`import` 失败和 `apply` 失败都被明确区分并抛出，而不是跳过。**宁可炸，不可静默。**

> ⚠️ 但注意：这条纪律**只在「Cordis 认识的资源」上被贯彻**。[第 5 章](05-配置.md)会看到一个反例 —— 挂错位置的 `Config` **不抛异常，只静默失效**。所以「宁可炸不可静默」是 Cordis 的**倾向**，不是**保证**。

</details>

---

**本章一句话总结**：

> 凡是会**改变外部状态**的操作，都要能被**撤销**；能自动撤销的（`ctx` 认识的）就别管，不能自动撤销的（`ctx` 不认识的）就用 `ctx.effect()` 包起来并交出撤销按钮。

---
