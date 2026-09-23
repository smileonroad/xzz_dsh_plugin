# 提案：reply-tips 提升为双端（Client + Host）标准可安装包

> 日期 2026-09-09。前置：`examples/grill-send-button/`（纯 Client 标准包）已走通
> 「打包 → 官方通道安装 → 浏览器实测」；本提案把它扩展到**双端合作**形态。

## 选题依据

- 官方手册 `deepseek-harness/docs/cookbook/adding-a-remote-api.md`（Typert Remote 五步：声明方法、声明失败、注册到包、Client 消费、测试）。
- 官方手册 `docs/user/develop/basic/publish.md`（bundle/profile 两概念、`dsh plugin add` 语义、层序）。
- 对比参照：`packages/feedback/message-feedback`（Host 远程服务 + 生成物 `./typert`、`./remote`）与 `packages/api/remotes/src/client/index.ts`（客户端装配 `ctx.remote.$mount`）。
- 现状：`examples/reply-tips` 的运行体是**动态 Cordis 插件双端**（`dynamic/code.host.js` 532 行 + `dynamic/code.client.js` 294 行），用 `harness.handle` / `host.call` 通信；本提案把它静态化为可安装包，同时保留动态版作为「快回路」教学素材。

## 已核实的关键事实（本次探索）

1. **bundle 层**：`dsh plugin --profile <name> add <spec>` 转发 pnpm 后，只有声明 `dsh.bundle.patch` 的依赖才进 `dsh.profile.bundles`（`apps/cli/src/plugin.ts`）。
2. **Host 远程注册**：`packages/typert/loader/src/index.ts` 扫 loader 条目，凡包 `package.json` 导出 `./typert` 就 import 并 `ctx.typert.register(manifest)`；解析锚是配置树 baseUrl（profile 目录），**独立包可被自动发现**。
3. **Host 调用解析**：`packages/api/gateway/src/index.ts` 的 `prepareInvocation` 用 `ctx.typert.local` 的已注册 descriptor（或 `@Remote` 装饰器标记）定位 endpoint，再 `ctx.get(serviceKey)` 取服务对象、`Reflect.apply` 调方法。因此**手写 manifest + 普通 Cordis 服务**即可被 gateway 调用。
4. **Client 命名空间**：`packages/api/gateway/src/client/index.ts` 的 `ctx.remote.$mount(contribution)` 是公开注册入口；内嵌装配 `api-remotes/client` 只是逐包 `$mount`，**我们的客户端半边可以自己 mount 自己的 contribution**，无需改动内嵌代码。
5. **产物形状**（从 `packages/feedback/message-feedback/lib/typert.host.js` / `typert.remote-client.js` 抄得）：
   - host：`export const TYPERT = { package, face:'host', schemas, model, invocations }`；
   - client：`export const TYPERT_REMOTE = { package, descriptors:[…] }`，descriptor 含 `id/service/namespace/method/invocation/parameters/result/sourceLocation`，参数与结果用 **strict codec**（zod v4 schema）。
6. **生成器边界**：`@deepseek-ai/dsh-typert-generator` 的 `WorkspaceTypertGenerator(root)` 以「含 face 聚合 tsconfig 的 workspace 根」为界（`src/workspace.ts`），面向 monorepo；独立包要跑它需自建聚合 tsconfig 并被其分析，风险较高。
7. **依赖解析**：profile 里以 `link:` 安装的包，Node 解析沿**真实路径**（本仓库/harness examples）向上找到 `deepseek-harness/node_modules`，因此 host 半边 import `@deepseek-ai/*`、`zod` 在本地安装形态下可用（发布到 registry 需改成真实依赖，记为限制）。

## 包形态

```text
examples/reply-tips/
├── package.json          # dsh.bundle.patch + dsh.client.platform + exports ./client、./typert、./remote
├── cordis.patch.yml      # insert 一行挂载包自身（Host 半边）
├── src/index.ts          # 纯函数层（现有，保持可测）
├── src/host.ts           # Host 半边：Cordis 插件 + 服务 + 手写 TYPERT manifest
├── src/host-wire.ts      # 手写 wire codec（zod v4 strict schema）与 descriptor 表
├── src/client.ts         # 浏览器半边：槽组件 + controller（由 dynamic/code.client.js 静态化）
├── src/client-wire.ts    # 客户端 contribution（descriptors + $mount 数据）
├── dynamic/              # 动态版运行体（保留，作快回路对照）
├── scripts/build.mjs     # host → 普通 ESM；client → __ModuleLoader__ 工厂 bundle（内联 wire）
├── scripts/verify.mjs    # 门禁：manifest/exports/bundle 行/产物形状/工厂可物化
├── lib/                  # 预构建产物（随包提交）
└── tests/                # 纯函数 spec（现有）+ host 服务 spec
```

### Host 半边职责

1. 提供 Cordis 服务 `replyTips`（`get` / `set` / `getSuggestions` 三个方法），沿用动态版语义：mem 缓存 + `fs` 落盘 `.reply-tips.json`、`sessionQuery.readSession` 回扫同轮配对、`llm.stream` 生成、多级解析 + `isJunkTip`、稳定性闸门（连续 2 次观测一致）、`notOld`、`reasoningEffort:'off'`、`maxTokens:8000`。
2. 用 `ctx.typert.register(manifest)` 注册三个 invocation（namespace `replyTips`），参数/结果 codec 与客户端一致。
3. 失败语义：业务失败走 `RemoteError`（如 `replyTips/no-text`），生成降级（无 LLM / 无模型选择 / 截断 / 解析失败）仍**返回 rules 兜底结果 + reason 字段**（不报错），与动态版一致。

### Client 半边职责

1. `inject: ['slots', 'timer', 'remote']`；`apply` 内 `ctx.remote.$mount(contribution)` 注册自身 namespace，再注册两个槽（`conversation.input.right` 开关、`conversation.input.dock` 建议行）。
2. 调用点改为 `ctx.remote.replyTips.get/set/getSuggestions`，并按 `RemoteResult` 分支（`if (!result.ok)`）。
3. 保留动态版已实测的时序：`session.running` true→false 边沿 refresh（清空 + 「获取中」）、800ms poll 兜底、controller 每会话单例。

## 双端桥接：两条路线

| 路线 | 做法 | 评价 |
| --- | --- | --- |
| A. typert 生成器（**已选定**） | 包内建聚合 tsconfig，构建期跑生成器的公开 API 产出 `lib/typert.host.js` / `lib/typert.remote-client.js` | 与内嵌包完全一致；生成器面向 monorepo workspace，已用暂存 workspace 打通（见下） |
| B. 手写 wire | `ctx.typert.register(manifest)` + 客户端 `ctx.remote.$mount(contribution)`，codec 手写 zod schema | 官方支持但脱离生成器，签名变更要手工同步；备选 |

### 实施记录（生成器路线的实测约束）

1. **包必须落在 `<root>/packages/` 下**（`analyzer.ts` 的 `isWithin(realPath(packageRoot), join(root,'packages'))`），且 `checkProject` 会把 `rootDir` 放宽到 `<root>`。因此构建脚本把包**暂存**到 `<harness>/packages/reply-tips`、在 harness 根放聚合 tsconfig（`hostConfig`/`clientConfig` 指向它），生成后回拷产物并清理。
2. **聚合配置必须同时引用 protocol 包**：`isTypeMetaSymbol` 只有在 `@deepseek-ai/dsh-typert-protocol` 也注册进同一 workspace 时才认 `@Remote` / `TypertRemoteService`。
3. **Remote 边界类型必须从非根子路径导出**（本包用 `./types`），否则边界类型被判为来自包根而被拒。
4. **服务类必须从包入口 `.` 导出**（生成器只看入口可达声明），并在 `declare module '@deepseek-ai/cordis'` 里声明 Context 服务键。
5. **客户端不 import 内嵌装配类型**（会把整个 in-box 远程面拖进分析并触发「merged interface 在本 face 之外」），改为自持极简 remote 类型垫片 + 一次断言。
6. **浏览器产物内联 zod**（与内嵌自 mount 包一致，无 `require("zod")`）；react 仍走模块表 `require("react")`。

## 测试与验证

1. **纯函数层**：现有 `tests/reply-tips.spec.ts`（29 用例）保持全绿。
2. **Host 服务 spec**：以真实 `sessionQuery`/`fs` 夹具 + 假 `llm` 服务挂载服务，钉住三方法行为（开关落盘、闸门出的 `generating`、`notOld` 不回旧缓存、`isJunkTip` 过滤）。
3. **包门禁 `scripts/verify.mjs`**：manifest 双声明、exports 四点、bundle 行、`__ModuleLoader__` 工厂可物化、host 半边可 import 并导出服务/插件形状、wire descriptor 与 zod codec 自检（参数名、result union）。
4. **安装实测**：同步 harness examples → `dsh plugin --profile web add ./examples/reply-tips` → 重启 web → 真实浏览器（Playwright）确认开关出现、打开后回合结束拉到胶囊、点击发送；无 console/page 报错。

## 风险与开放问题

- 手写 manifest 与 gateway 期望的 `RemoteResult` 包装必须逐字段对齐（尤其 `ok/error` union 与 `typeSymbol`），首次需以实测校正；若 gateway 对 descriptor 有额外校验，回退到 A。
- `ctx.typert.register` 的精确入参类型（`TypertContribution`）需在实现时对照 `packages/typert/protocol/src/types.ts` 与 registry 实现核验。
- Host 半边依赖 `agentDefaultModel`/`llm` 在 web profile 的可用性；不可用时只走 rules 兜底（与动态版一致）。
- 浏览器 bundle 内联 zod 会增大体积（预计 ~100KB），需在 verify 里记录体积并接受。
- 发布到 registry 的依赖问题（`@deepseek-ai/*`、`zod` 需真实声明）不在本提案范围，记为已知限制。

## 分阶段

- **P1**：包结构 + host/client 半边 + build/verify 门禁，纯函数与 host 服务 spec 全绿。
- **P2**：双语 README 补「安装与双端接线」章节；DESIGN 修订记录追加静态化说明。
- **P3**：装进 web profile、重启、真实浏览器端到端验证；文档与笔记收尾，提交推送。

P3 需要重启 web 进程（会短暂打断当前 GUI），时机由维护者决定。
