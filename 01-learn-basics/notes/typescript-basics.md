# TypeScript 项目开发基本知识

> 面向 DeepSeek Harness 代码库的入门笔记。例子尽量取自 harness 真实代码，便于对照理解。
>
> 配套阅读：[架构文档（官方，已归档）](../sources/architecture.zh.md)

---

## 目录

- [一、TypeScript 的本质](#一typescript-的本质)
- [二、必须掌握的核心语法](#二必须掌握的核心语法)
- [三、工程化：tsconfig.json 是理解项目的钥匙](#三工程化tsconfigjson-是理解项目的钥匙)
- [四、模块系统：ESM 与包解析](#四模块系统esm-与包解析)
- [五、harness 的形态：pnpm workspace monorepo](#五harness-的形态pnpm-workspace-monorepo)
- [六、工具链与常用命令](#六工具链与常用命令)
- [七、读 harness 代码的建议路径](#七读-harness-代码的建议路径)

---

## 一、TypeScript 的本质

TypeScript = JavaScript + **静态类型系统** + **编译器**。

关键认知：**类型只存在于开发期**。`tsc` 把 `.ts` 编译成 `.js` 时，所有类型标注会被**完全擦除**，运行时不存在类型信息。

```ts
const n: number = 1            // 编译后 → const n = 1
interface User { id: string }  // 编译后 → 整行消失
```

由此推出三条实践结论：

| 结论 | 说明 |
|---|---|
| 类型错误在**编辑器/构建时**发现，不是运行时 | 需要运行时校验的场景仍要手写 |
| 运行时校验必须单独写 | harness 用 `validateSessionEventData` 这类函数做 |
| 类型不影响性能，但影响产物体积 | `.d.ts` 声明文件会发布给使用者 |

---

## 二、必须掌握的核心语法

### 2.1 基础标注与推断

```ts
const name: string = 'dsh'
let count = 0                    // 推断为 number，不必手写
function add(a: number, b: number): number { return a + b }
```

**推断优先**：只在推断不出、或想收窄时才手写类型。

### 2.2 `interface` vs `type`

```ts
interface SessionStore { get(id: string): Session }   // 描述对象形状，可声明合并
type SessionId = string & { __brand: 'SessionId' }    // 联合/交叉/别名，更灵活
```

选择原则：描述对象结构用 `interface`，其余（联合类型、工具类型）用 `type`。

### 2.3 联合类型与字面量类型 —— TS 最有价值的部分

```ts
type Status = 'idle' | 'running' | 'done'    // 不是任意 string
```

配合**收窄（narrowing）**，编译器能保证你把所有情况都处理了：

```ts
function label(s: Status) {
  switch (s) {
    case 'idle': return '空闲'
    case 'running': return '运行中'
    case 'done': return '完成'
  }   // 不需要 default，编译器知道已穷尽
}
```

harness 有 `assertNever` 这类工具，用于在穷尽性被破坏时报错。

### 2.4 可选与只读

```ts
interface Opts {
  readonly id: string      // 不可重新赋值
  timeout?: number         // 可能为 undefined
}
```

> ⚠️ harness 开启了 `exactOptionalPropertyTypes`，意味着 `{ timeout: undefined }` 和 `{}` **不相等**。

### 2.5 泛型

```ts
function first<T>(arr: T[]): T | undefined { return arr[0] }
```

harness 最典型的泛型用法是事件映射表 `SessionEventMap` —— 事件名到参数类型的映射。

### 2.6 内置工具类型（高频）

```ts
Partial<T>            // 全部变可选
Required<T>           // 全部变必选
Pick<T, 'a' | 'b'>    // 挑字段
Omit<T, 'a'>          // 去字段
Record<K, V>          // 键值表
ReturnType<typeof fn> // 取函数返回类型
Awaited<Promise<T>>
```

### 2.7 `unknown` 优于 `any`

```ts
catch (e) {                    // e 是 unknown，必须收窄后才能用
  if (e instanceof Error) console.log(e.message)
}
```

harness 开了 `strict: true`，`any` 基本被禁止。宁可 `unknown` + 收窄。

### 2.8 `import type` —— 只导入类型

```ts
import type { Message } from '@deepseek-ai/dsh-llm'    // 编译后整行消失，不进运行时
import { Context, Service } from '@deepseek-ai/cordis' // 真需要运行时值
```

在 `packages/core/session/src/index.ts` 中，两类导入是刻意分开的 —— 这个习惯能显著改善循环依赖和打包体积。

---

## 三、工程化：`tsconfig.json` 是理解项目的钥匙

`tsconfig.json` 决定「哪些文件参与编译、按什么规则、产物放哪」。`tsconfig.base.json` 是最重要的一份。

### 3.1 关键配置项

| 配置 | 值 | 含义 |
|---|---|---|
| `target` | `es2024` | 生成的目标 JS 版本 |
| `module` / `moduleResolution` | `esnext` / `bundler` | 用 ESM，按打包器语义解析路径 |
| `strict` | `true` | 开启全套严格检查（含 `strictNullChecks`） |
| `noUncheckedIndexedAccess` | `true` | `arr[0]` 的类型是 `T \| undefined`，逼你判空 |
| `exactOptionalPropertyTypes` | `true` | 可选属性不能显式传 `undefined` |
| `noUnusedLocals` / `noUnusedParameters` | `true` | 未使用的变量/参数直接报错 |
| `noImplicitOverride` | `true` | 覆写父类方法必须写 `override` |
| `composite` + `incremental` | `true` | 支持「项目引用」和增量编译 |
| `paths` | 见下 | 把包名映射到**源码目录** |
| `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` | `true` | 源码可写 `./types.ts`，编译时自动改成 `./types.js` |

最后一条解释了为什么 harness 源码里到处是 `import ... from './types.ts'` 带 `.ts` 后缀 —— 这是 Node ESM 下让「源码直跑」和「编译产物」同时正确的做法。

### 3.2 三个关键的架构决策

#### ① 用 Project References 而非路径别名

```jsonc
// packages/core/session/tsconfig.json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "lib/types" },
  "references": [
    { "path": "../../../vendor/cordis" },
    { "path": "../session" }
  ]
}
```

每个包引用它依赖的包，`tsc -b` 按拓扑序增量编译。好处是每个包有自己的编译边界 —— 而不是把所有源码糊成一个大 program。

#### ② 双 face：host / client 分离

根 `tsconfig.json` 是 solution 文件，只含：

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.host.json" },
    { "path": "./tsconfig.client.json" }
  ]
}
```

**为什么要拆？** 注释写得很清楚：

> both sides merge cordis Context under the same keys (sessions, loader) with different services; one program cannot see both.

即 Cordis 通过 `declare module` 做接口合并，服务端和客户端往同一个 `Context` 上挂同名不同实现的属性，放一个 program 里会冲突。所以拆成两个独立的检查单元。

#### ③ 两段式构建

```
src/*.ts  ──tsc──▶  lib/types/*.js + *.d.ts ──tsdown──▶ lib/index.js
```

`tsc` 负责类型检查和产出声明文件，`tsdown` 负责把 `lib/types/index.js` 打包成最终发布的 `lib/index.js`。

---

## 四、模块系统：ESM 与包解析

```ts
// 相对导入（本包内部，必须带扩展名）
import { foldRequestHeader } from './request-header.ts'

// 包导入（跨包，走 node_modules / pnpm link）
import { Context } from '@deepseek-ai/cordis'
```

### 4.1 `exports` 字段控制公开 API

`package.json` 里的 `exports` 定义包的公开入口：

```jsonc
"exports": {
  ".":              { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
  "./types":        { ... },
  "./invariant":    { ... },
  "./package.json": "./package.json"
}
```

> **未在 `exports` 列出的路径，外部就无法导入。** 这是包作者控制公开 API 的手段。

### 4.2 dependencies 与 peerDependencies

```jsonc
"peerDependencies": {
  "@deepseek-ai/dsh-scope": "workspace:^",
  "@deepseek-ai/cordis": "workspace:^"
}
```

`peerDependencies` 意味着「由宿主提供」，插件包通常这么写。

---

## 五、harness 的形态：pnpm workspace monorepo

### 5.1 目录布局

| 目录 | 作用 |
|---|---|
| `packages/` | 核心代码，按**领域**二级分类（`core/`、`llm/`、`session/`、`client/`…） |
| `apps/` | 产品装配层：`cli`、`desktop`、`web`、`desktop-host` |
| `vendor/` | 内联的框架包（cordis、cosmokit、schemastery） |
| `native/` | 原生插件（Landlock 沙箱） |
| `scripts/` | 构建、生成、校验脚本 |

### 5.2 工作区协议

```jsonc
"dependencies": {
  "@deepseek-ai/dsh-llm": "workspace:^"   // 解析到工作区内的包，不下载
}
```

`pnpm-workspace.yaml` 里的 `overrides` 和 `linkWorkspacePackages: true` 保证 vendored 的框架包解析到本地源码而非 npm。

### 5.3 供应链安全策略（值得注意）

`pnpm-workspace.yaml` 的 `allowBuilds` 是**白名单制**：

```yaml
allowBuilds:
  esbuild: true
  lefthook: true
  # ...
  protobufjs: false
```

依赖包的任何 install 脚本**默认被拒绝**，必须显式列出才允许执行。这是供应链防护。

### 5.4 架构：everything-is-a-plugin

基于 Cordis 的插件/服务容器。服务的注入方式是**模块声明合并**：

```ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    sessions: SessionStore      // 现在 ctx.sessions 有类型了
  }
  interface Events {
    'session/created'(this: Scoped<Session>, session: Session): void
  }
}
```

这是 TypeScript 的 **declaration merging（声明合并）** —— 插件在自己文件里往全局 `Context` 接口「补充」一个字段，宿主侧无需修改任何代码就能获得类型。

**理解了这一点，就看懂了 harness 大半的类型写法。**

---

## 六、工具链与常用命令

### 6.1 工具清单

| 工具 | 角色 | harness 用什么 |
|---|---|---|
| 包管理 | monorepo 依赖 | **pnpm** |
| 运行时跑 TS | 免编译直跑 `.ts` | **tsx** |
| 类型检查 | `tsc -b` | TypeScript 6 |
| 打包 | 产出发布物 | **tsdown** |
| 测试 | 单测/快照/e2e | **vitest** |
| Lint | 静态检查 | **oxlint**（替代 eslint，Rust 实现） |
| Git hooks | 提交前拦截 | **lefthook** |

### 6.2 常用命令

```bash
pnpm install            # 安装依赖
pnpm run build          # 完整构建
pnpm dsh web            # 起 Web UI（用已构建产物）
pnpm run dev:web        # 开发模式（带热更新）

pnpm run typecheck      # 全量类型检查
pnpm run lint           # 静态检查
pnpm test               # 跑测试（会先构建 native）
```

> ⚠️ `typecheck` 和 `lint` 都先跑 `build:lib:host` —— 因为跨包类型依赖编译产物的声明文件。

---

## 七、读 harness 代码的建议路径

### 7.1 推荐顺序

1. **先读文档**：`docs/development.md`、`docs/architecture.md`、`AGENTS.md`
2. **理解 Cordis 容器**：读 `docs/cordis-primer.zh.md` 和 `vendor/cordis/` 源码
3. **挑一个包通读**：`packages/core/session/` 是好样本 —— 约 3000 行，结构完整（`types.ts` / `index.ts` / `tests/`），注释质量高
4. **包的四件套**：每个包基本都是 `package.json` + `tsconfig.json` + `tsdown.config.ts` + `src/` + `tests/`，看懂一个就看懂全部

### 7.2 TypeScript 阅读小抄

看到这些写法时的心智模型：

```ts
import type { X } from '...'       // 仅类型，运行时不存在
declare module 'pkg' { ... }       // 声明合并，扩展别人的类型
export type { X }                  // 只导出类型
satisfies T                        // 检查符合 T 但保留更精确的推断
as const                           // 字面量推断，得到最窄类型
readonly T[]                       // 只读数组
T & U                              // 交叉类型，同时具备两边
T extends U ? A : B                // 条件类型
{ [K in keyof T]: ... }            // 映射类型
```

### 7.3 三条速读技巧

| 看到 | 想到 |
|---|---|
| `ctx.xxx` | 这是某个插件提供的服务，去核心包表查归属 |
| `ctx.on('yyy', ...)` | 看类型签名判断分发模式（有 `next` 参数 = waterfall） |
| `declare module '@deepseek-ai/cordis'` | 插件在往全局 Context 上挂东西 |
