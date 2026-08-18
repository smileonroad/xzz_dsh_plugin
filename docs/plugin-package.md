# 插件包布局与分发

> 摘要：dsh 标准 bundle 包的逐文件清单、包拓扑命名、README 规范与验证流程。
> 上游：[`reference/cookbook/adding-a-package.zh.md`](../reference/cookbook/adding-a-package.zh.md)。

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

## 对实战的意义

`examples/helloworld-command/` 是教学示例，**没有 package.json**，`dsh plugin add` 无法消费。要分发必须按本清单升级为标准 bundle：建包、加 `cordis.patch.yml` 插入插件行、准备自包含构建（git 安装拉源码不拉 `lib/`）。详见示例 README 的「如何发布应用」一节。
