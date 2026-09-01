# headless：一次性任务 CLI

> 相关代码：`apps/cli`（dsh CLI）、[demo/run-headless.mjs](../../demo/run-headless.mjs)

headless，直译就是「无头」。不是吓人，是它真的没有脸——没有界面、没有会话、没有常驻进程。跑一条命令，打印结果，退出，干干净净。

这是 DSH 最朴素的一种打开方式，也是整个系列的地基。后面要讲的 acp、jsonrpc、web，全是它的会话化变体，只是换了接入方式。把这一个搞明白，agent 最基本的样子你就见过了。

## 是什么

headless 就是**跑一条命令、打印结果、退出**：无服务器、无持久会话、无图形界面，纯一次性任务。

## 怎么用（运行 demo）

运行器脚本 [demo/run-headless.mjs](../../demo/run-headless.mjs) 把整条命令封装好了，一行就跑（在 deepseek-harness 根目录，脚本已同步到其 `demo/`）：

```bash
node demo/run-headless.mjs "任务描述"
```

比如我当初验证连通性跑的是：

```bash
node demo/run-headless.mjs "用一句话回答：DSH headless 模式是什么？"
```

换模型用 `--patch` 追加 overlay：

```bash
node demo/run-headless.mjs --patch demo/model.patch.yml "任务描述"
```

## demo 代码说明

`run-headless.mjs` 就干三件事：解析参数、spawn dsh CLI、把关键环境变量传进去。看核心这一段：

```js
const child = spawn(process.execPath, ['--import', 'tsx', DSH_BIN, '--profile', 'headless',
  ...patches.flatMap(p => ['--patch', p]), task], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL, // 启动环境提供，脚本不内置内部网关地址
    DSH_PERMISSION_MODE: 'danger-full-access',
  },
  stdio: 'inherit',
})
```

几个关键点，逐个说：

- `--profile headless`：告诉 dsh CLI 走 headless 模式，跑完即退。
- `--patch <file>` 可多次：运行时追加 overlay，覆盖组合里的某行 config。换模型就靠它。
- `env` 里手动塞 `DEEPSEEK_BASE_URL`：这个变量**不能放 `.env`**（bootstrap-only），只能由启动环境给，所以脚本在这里显式传。
- `DSH_PERMISSION_MODE=danger-full-access`：任务需要 bash/文件工具时自动放行，不弹权限追问——无人值守的代价就是全放行。
- `stdio: 'inherit'`：子进程输出直接透传到终端，你看到的就是模型说的。

换模型用的 [demo/model.patch.yml](../../demo/model.patch.yml) 也很简单，就是一个覆盖 `agent-default-model` 配置的 overlay：

```yaml
- id: agent-default-model
  config:
    provider: deepseek-official
    model: deepseek-v4-flash   # ← 改成目标模型 id
```

## 自定义模型配置（当时改的三处）

连本地网关时，headless 也改了 url、key、模型名称三处，但机制和 acp 不同——headless 用 `--patch` 换模型，不直接改配置树：

1. **url（网关地址）**：`DEEPSEEK_BASE_URL` 由启动环境提供（bootstrap-only，不能放 `.env`），[demo/run-headless.mjs](../../demo/run-headless.mjs) 从环境变量读取后透传给子进程。换网关改环境变量即可。
2. **key**：根 `.env` 提供 `DEEPSEEK_API_KEY`，由 bin 的 `loadEnv` 加载。
3. **模型名称**：headless 的默认模型来自 base bundle 的 `agent-default-model`，用 `--patch` 覆盖它：

   ```bash
   node demo/run-headless.mjs --patch demo/model.patch.yml "任务描述"
   ```

   [demo/model.patch.yml](../../demo/model.patch.yml) 内容就是覆盖 `agent-default-model` 的 config（模型 id 原样透传，网关认识即可）：

   ```yaml
   - id: agent-default-model
     config:
       provider: deepseek-official
       model: deepseek-v4-flash   # ← 改成目标模型 id
   ```

## 怎么跑通

1. 根目录 `.env` 提供 `DEEPSEEK_API_KEY`（`bin` 的 `loadEnv` 会加载它；没有 `.env` 时也会读 `~/.dsh/.credentials.yaml` 的全局凭据）。
2. 网关地址 `DEEPSEEK_BASE_URL` 是 bootstrap-only 变量，**不能放 `.env`**，由运行器脚本在 env 里显式传入。
3. `DSH_PERMISSION_MODE=danger-full-access`：任务需要 bash/文件工具时自动放行，不做权限追问。
4. 跑完进程退出，exit code 反映成败。

## 执行结果输出

实跑（key 来自 `~/.dsh/.credentials.yaml` 全局凭据）：

```bash
node demo/run-headless.mjs "用一句话回答：DSH headless 模式是什么？"
```

终端直接打印模型回答，没有协议中间层：

```
DSH headless 模式是 `dsh --profile headless "task"` 这种一次性、非交互式的运行方式：它通过一个完全不带服务器和浏览器的组合包，创建一个全新的持久化会话提交任务并等待完成，然后把最终答案打印到 stdout 后退出（完成返回 0，否则返回 1）。
```

`stdio: 'inherit'` 让子进程 stdout 直透终端——你看到的就是模型说的，没有 initialize/session 之类的协议字样。退出码 0 即任务成功（demo 读取子进程 exit code 判定）。

## 踩过的坑

**bootstrap-only 变量放进 `.env` 不生效。** 最初把网关地址写进根 `.env`，运行毫无反应。原因是 app-boot 的 `loadLayeredEnv` 拒绝 `.env` 声明 `DEEPSEEK_BASE_URL`（进程连网 bootstrap-only，只能由启动环境决定）。修复：运行器脚本用 `env: { ...process.env, DEEPSEEK_BASE_URL }` 显式传入。

## 验证方式

headless 是一次性任务，验证简单直接：看退出码 + 打印结果。若要确认工具真的执行过，可以让任务写一个文件，再去磁盘上检查文件存在。

## 使用场景

- 脚本/CI 里跑一次性任务，不需要交互。
- 快速验证配置和模型连通性（跑通 headless = 内核基本可用）。
- 批量执行无状态任务。

## 特点

- **一次性**：跑完即退，无常驻进程、无持久会话。
- **无界面**：纯命令行，适合无人值守。
- **配置驱动**：行为由 `cordis.yml` + `--patch` overlay 决定，换模型/换工具都改配置不改代码。
- **底座地位**：理解 headless 是理解其余 surface 的前提。
