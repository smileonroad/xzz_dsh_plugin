# helloworld-command 示例

[English](README.md) | 中文

一个最小的人机交互斜杠命令插件：`/helloworld [<name>]` 问候用户，不经过模型轮次。它演示了 [`ctx.commands`](../../packages/interaction/commands/README.md) 扩展点——仓库中最小的完整命令插件。

## 运行

本目录是插件源码的**权威来源**。要运行，先把它拷贝到 deepseek-harness 源码的 `examples/`（那边的同名目录可能不同步），再在 deepseek-harness 根目录操作：

```sh
# 1. 拷贝到 deepseek-harness 源码（本仓库是权威来源）
cp -r examples/helloworld-command ../deepseek-harness/examples/helloworld-command

# 2a. 跑测试
cd ../deepseek-harness
pnpm exec vitest run examples/helloworld-command/tests/helloworld-command.spec.ts

# 2b. 或挂载进 web UI（临时，用 patch 层）
pnpm dsh web --patch examples/helloworld-command/helloworld.patch.yml
```

> 注意：web 的 HMR 在发布版默认禁用——加完插件后必须重启 web 进程，命令才会出现。
>
> 注意：patch 里 entry 的 `name` 相对 **profile 目录**（`~/.dsh/profiles/web/`）解析，不是相对本文件。`helloworld.patch.yml` 用相对路径 + profile 目录下 junction 的方式，首次使用先建 junction（Windows，无需管理员）：
>
> ```sh
> cmd //c "mklink /J %USERPROFILE%\.dsh\profiles\web\examples <deepseek-harness>\examples"
> ```
>
> 不想用 junction 就改回绝对 `file:///` URL（规则见该文件顶部注释，另有 DSH_HOME 同盘、bundle 安装两种替代）。

已在 web UI 端到端验证（2026-08-16），四层证据：（1）输入 `/` 后命令菜单列出 helloworld；（2）执行 `/helloworld <name>` 约 1 秒内对话流渲染出命令节点（不走模型轮次）；（3）每次执行在会话日志里留下成对的 `command/run` + `command/done` 记录；（4）重新打开会话，命令节点从日志原样重放，会话的轨迹视图按轮次列出每一步事件（命令输入、工具调用、结果）。

## 设计思路

命令直接从人的命令行分派给处理器，不发起任何模型请求。对于确定性、由人驱动的操作，这个形态是对的——与由模型自行调用的工具不同。

设计的三个关键决定：

- **`inject: ['commands']` 声明依赖。** Cordis 在加载插件前等待命令注册表就绪，因此 `apply` 读取 `ctx.commands` 是安全的。
- **`register` 是一个副作用。** 销毁插件 fiber 即注销命令。注册绝不会比其所有者活得更久。
- **处理器拥有自己的语法。** `invocation.rawInput` 是命令名之后的精确文本（包含分隔空白）；`parseName` 决定什么是问候目标、什么是用法错误。没有其他包拥有问候语词汇。

该命令不拥有会话事件流——生命周期（`command/run`/`command/done`）由命令注册表自己记录——所以除了命令自身的行为，没有别的包不变量需要断言。

> **深入：为什么 `rawInput` 带分隔空白？**
>
> `rawInput` 是命令名之后的**原样**文本——`/helloworld 小明` 得到 `" 小明"`，前面带一个空格，因为注册表把分隔符算进了原始输入。handler 必须先 `trim()` 再解析，否则会一直「看到」一个莫名的前导空格。这个坑几乎每个第一个插件都会踩（笔记里记成了经典坑）；调试技巧是测试里打一行 `rawInput`，跑一次就亲眼看见那个空格。

## 如何开发

```
helloworld-command/
├── src/index.ts                 # 插件：name / inject / apply
└── tests/helloworld-command.spec.ts
```

> 关系说明：本目录是 `/helloworld` 插件的完整源码+测试包；`notes/2026-08-15-helloworld-command.md` 记录了背后的学习心得。

- `src/index.ts` —— `name = 'helloworld-command'`，注册 `/helloworld` 命令。`CommandResult` 是 UI 的直接输出：`{ kind: 'success', text }` 或 `{ kind: 'error', text }`。
- `tests/helloworld-command.spec.ts` —— 启动真实的 `CommandRuntime` 与会话存储，stub 一个 agent，并通过 `ctx.commands.execute()`（与 UI 适配器相同的边界）执行 `/helloworld`。六个用例覆盖注册、问候、命名问候、多词拒绝、生命周期事件与 admission miss。

若还想验证插件挂载进**真实 Loader 组合树**（经 app bin 启动 `cordis.yml`），参照 dsh 源码中 `examples/headless-agent/tests/` 的 `runLoaderSmoke` 模式（`packages/test-support/loader-smoke`）。

运行测试：

```sh
pnpm exec vitest run examples/helloworld-command/tests/helloworld-command.spec.ts
```

## 如何发布应用

该目录当前是一个**教学示例**，不是可安装的包：它没有 `package.json`，因此无法被 `dsh plugin add` 消费。要把它分发给其他用户，需要把它提升到 `packages/` 中作为标准 bundle，并遵循[打包教程](../../docs/user/develop/basic/publish.md)：

1. **创建包**，位于 `packages/interaction/helloworld-command/`，包含 `package.json`（名称为 `@deepseek-ai/dsh-helloworld-command`、`private: true`、`dsh.bundle.patch`）、`tsconfig.json`、`src/invariant.ts` 和双语 README。
2. **添加 `cordis.patch.yml`**，按包名插入插件行，使 profile 挂载它。
3. **分发构建产物。** git 安装拉取的是源码而非 `lib/` 输出——添加自包含构建的 `prepare` 脚本，或发布到 npm / tarball，使安装无需构建权限。
4. 然后用户通过 `dsh plugin --profile <name> add github:you/helloworld-command#<sha>`（git）或 `dsh plugin --profile <name> add @deepseek-ai/dsh-helloworld-command`（npm）安装，profile 的 `cordis.patch.yml` 应用该 bundle 层。

完整的 bundle 契约与构建脚本陷阱见[打包并安装插件](../../docs/user/develop/basic/publish.md)。