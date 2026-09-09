# 插件包布局与分发

> 摘要：dsh 插件包的布局、命名、README 规范与验证流程，以及独立分发包（装进任意 profile）的双面 Client 形态、官方安装通道 `dsh plugin add` 与浏览器产物必须的 `__ModuleLoader__` 工厂格式。
> 上游：[`reference/cookbook/adding-a-package.zh.md`](../reference/cookbook/adding-a-package.zh.md) + deepseek-harness `docs/user/develop/basic/publish.md`（后者在本仓库 reference/ 未收录，hash 不配对；见 `docs/README.md` 配对表备注）。

## 包的最小结构

```
packages/<group>/<pkg>/
  package.json     # 抄 packages/core/tools，改 name/description/deps
  tsconfig.json    # extends ../../../tsconfig.base.json；references vendor/cosmokit、vendor/cordis
                   # （用 Config 加 schemastery；每个 dsh 依赖也加 reference）
  src/index.ts     # service default export 或插件（name/inject/apply/Config）
  README.md        # 服务 API、事件、扩展点、设计说明 + Model Experience + Known Limitations
```

分组已有就复用（`core`、`llm`、`bash`、`compact`、`subagent`、`todo`、`session-persistence`、`ui`、`util`、`support`）；新分组只是纯容器，包仍恰好在其下一层。

## package.json 不变式（`pnpm run constraints` 强制）

- `private: true`；`version` 与根一致；`type: module`
- `main: "lib/index.js"`，`types: "lib/types/index.d.ts"`，exports 同样指向 lib
- `@deepseek-ai/cordis` 同时出现在 peerDependencies 和 devDependencies（相同范围）；每个 dsh peer 依赖在 dev 里镜像
- `@deepseek-ai/schemastery` 放 dependencies（运行时校验器）
- `files` 精确列出 `lib/index.js`、`lib/invariant.js`、`lib/types/**/*.d.ts` 等；**不发布 src、map、陈旧根声明**
- 源码内相对导入用显式 `.ts` 后缀，编译器输出时改写为 `.js`

## 注册到根配置

- 已有分组：`tsconfig.base.json` 不用动；新分组加 `./packages/<group>/*/src` 候选路径
- Host 包加 `tsconfig.host.json` 的 references，Client 包加 `tsconfig.client.json` 的 references，**恰好一个，绝不两个都加**
- workspaces、publint、tsdown、oxlint 等由 glob/manifest 自动发现，不手编

## 包拓扑与角色命名

可替换能力（Service Definition / Provider / Consumer）需要独立演进时拆包（见 architecture § Capability seams）。名称描述**当前稳定职责**，不用首实现、未来扩展或 Cordis 基类命名：

- 单数 `ctx` key：engine / runtime / policy / controller / resolver / store / config
- 复数 `ctx` key：registry 或拥有多个具名成员的服务；类角色与 key 单复数一致
- 常见角色速查：`Registry` 拥有动态具名注册与查询规则；`Runtime` 跨调用拥有分派/取消/生命周期；`Store` 拥有数据并主要提供 CRUD；`Provider` 提供能力定义的一个实现（多实现加机制/厂商限定词）；`Config` 拥有已解析配置值。**不因为类继承 Cordis `Service` 就用 `Service` 命名**
- `SDK` 只用于 JSON-RPC 客户端/服务器协议；产品拼写统一 `Typert`

## README 规范

服务 API / 配置 / 事件 / 扩展点在前；持久消费方缺口进 "Known Limitations and Deferred Work"（日常清理留源码 TODO）；Model Experience 章节按「请求上下文与条件 / 模型看到什么 / Token effect / KV Cache effect」填，无模型上下文效果的包用审计过的 `None, as ` 语句或 `NO_MODEL_EXPERIENCE_SECTION`。

## 验证

```sh
pnpm install && pnpm run doc-sync
pnpm run constraints && pnpm run typecheck && pnpm run lint
pnpm run build && pnpm run hygiene
```

## 独立分发包（装进任意 profile）

上面的清单是 dsh 仓库内 `packages/` 的标准包。同一套包形状可以**独立分发**，装进任何 profile；`examples/grill-send-button/` 实战（提案 `docs/proposals/2026-09-09-grill-send-standard-package.md`）按本流程走通并实测。

### bundle 与 profile 两个概念

- **bundle** = 一个 npm 包，`package.json` 声明 `dsh.bundle.patch` 指向自带 `cordis.patch.yml`，构成一层配置层。回答的是「这个包贡献什么」。
- **profile** = `$DSH_HOME/profiles/<name>` 目录，`package.json` 的 `dsh.profile.bundles` 按序列出用哪些 bundle。回答的是「这套组合怎么搭」。
- 一个包要么是 bundle 要么是 profile，没有既是。

### 双面 Client 包的最小文件集（grill 实测形态）

以纯 Client 插件（浏览器按钮）为例，独立包 = 仓库包形状 + 分发的壳：

```text
<独立包目录>/
├── package.json        # dsh.bundle.patch + dsh.client.platform + exports + files
├── cordis.patch.yml    # - insert: [{ id, name: '<包名>' }]
├── src/index.ts        # 浏览器半边本体（契约 + apply，零 import，动态流程可原样贴）
├── src/host.ts         # node 半边空桩（export apply 即可，纯 UI 包惯例）
├── lib/client.js       # 预构建浏览器产物：__ModuleLoader__ 工厂格式（见下节）
├── lib/index.js        # 预构建 node 半边（普通 ESM）
└── scripts/build.mjs / verify.mjs
```

package.json 关键字段：

```json
{
  "name": "@scope/dsh-xxx",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": { "default": "./lib/index.js" },
    "./client": { "default": "./lib/client.js" },
    "./src/*": "./src/*",
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web" }
  }
}
```

- `.`（main）= node 半边，必须是 loader 可直接挂载的 Cordis 插件形状（导出 `name` / `apply`）。
- `./client` = 浏览器半边；`dsh.client.platform: "web"` 声明它会被 web 的 client-modules 服务发现并注入启动图。
- `cordis.patch.yml` 只挂一行包自身：`- insert: [{ id: <行id>, name: '<包名>' }]`，与 web-app bundle 里挂内置 UI 包的行同款（行 `name` 由 Node 解析到安装后的代码）。
- 内嵌内置包和第三方包走同一条加载路径，区别只在解析锚点：内置名从 dsh 安装解析，第三方装在 profile 的 node_modules 里从 profile 解析。

### 官方安装通道：`dsh plugin add` 的精确语义

实现位于 `apps/cli/src/args.ts` + `apps/cli/src/plugin.ts`（e2e 覆盖 `add .`、`remove`、`update`），官方手册 publish.md 同步：

- `dsh plugin --profile <name> add <spec>` 把剩余参数**原样转发给 pnpm、在 profile 目录里执行**（首次使用自动初始化 base-backed profile）。spec 是任意 pnpm 形式：npm 包名、git（`github:` / `git+ssh:`，可钉 `#commit`）、tarball、本地目录；`.` / `../` / `file:` / `link:` 相对**敲命令的目录**锚定（pnpm 的 cwd 在 profile，不锚定会把 profile 自己 link 进去）。
- 装完 reconcile `dsh.profile.bundles`：**声明 `dsh.bundle` 的依赖**才会被追加进层列表并激活；没声明的照装，但只是普通依赖并打 warning。`remove` 同时摘掉依赖与层。
- 层序：bundle 层按 bundles 列表顺序叠在 base 之上，其后是 profile 自身 `cordis.patch.yml`、`$DSH_HOME/cordis.patch.yml`、`--patch` 覆盖层。后层按行 `id` 覆盖整行 config（整行替换不是深合并）。
- 生效**必须重启进程**：bundle 列表在 boot 时读取，profile 的 `patchReload: live` 只热重载用户层 `cordis.patch.yml`；client-modules 的包元数据缓存到重启才失效。
- git 安装拉的是仓库源码不是构建产物：要么包自带 `prepare` 脚本并在 profile 的 `pnpm-workspace.yaml` 给 `allowBuilds` 放行（pnpm≥10 第一次 add 会失败并打印修复指引），要么分发带预构建 `lib/` 的 npm 包或 tarball。包在 monorepo 子目录时 git spec 只能装仓库根，跨机分发要走 publish 或拆独立仓库或 `pnpm pack` tarball。

### 客户端产物必须走 `__ModuleLoader__` 工厂格式（实测踩坑）

浏览器侧插件加载器（deepseek-harness `packages/client/modules/`）只认一种产物：文件顶层一次 `window.__ModuleLoader__.load({ id, factory })`，`factory` 是 CJS、用同步 `require` 从模块表取依赖（`react`、`@deepseek-ai/cordis` 等 seed 词），返回 `module.exports`（`name` / `inject` / `apply` ...）。同一批 combo 脚本靠每个成员这样**自登记**。

裸 ESM 产物（只 export、从不调用 `load`）**装不上**，症状是整批失败：

```
client-modules: bundle <url> loaded without registering "<id>" via __ModuleLoader__.load
```

真实浏览器里表现为页面顶部 `Failed to load plugins`。所以 `lib/client.js` 不是简单 TS→ESM，而是 esbuild 出 CJS 主体后包进 `load` 调用：

```js
window.__ModuleLoader__.load({
  id: '<包名>',            // 必须与 dsh.client 包名一致
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    const React = require('react');   // React 走模块表，不在浏览器全局
    /* esbuild CJS 主体 */
    return module.exports;
  },
});
```

内置 `@deepseek-ai/dsh-client-ui-*` 的 tsdown client preset 产物就是这一形状。src 保持零 import（动态流程能原样贴进 GUI）与静态包装互不冲突：同一个 `apply` 主体，只是外壳不同。

## 对实战的意义

`examples/grill-send-button/` 已按本节走完整条链：纯 Client 按钮 → 独立标准包（`dsh.bundle` + `dsh.client` + `cordis.patch.yml` + 预构建 lib）→ 官方通道 `dsh plugin --profile web add ./examples/grill-send-button` 装进 web profile → 真实浏览器验证按钮出现且可用。坑（裸 ESM 客户端产物加载失败、新 bundle 必须重启才生效）都已记入本节。`examples/helloworld-command/` 等不带 `package.json` 的教学示例仍不能直接 `add`，要分发按本节清单升级。
