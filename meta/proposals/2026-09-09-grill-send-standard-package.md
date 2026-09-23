# 提案 v2 2026-09-09 — grill-send-button 做成独立可安装的标准 Client 包

## 选题依据

- `examples/grill-send-button/README.zh.md`「分发」节与最近两篇笔记的收尾都指向「把演示体提升成标准包」。
- 仓库系列目前只有动态验证与 Host 型自包含 bundle，还没有一个「独立 Client 包 + 测试门禁 + 从 git/路径安装后在 dsh 里可用」的闭环例子。
- 官方依据：`reference/cookbook/adding-a-package.zh.md`、deepseek-harness `packages/client/AGENTS.md`、本仓库 `docs/plugin-package.md`，模板形态参考 `ui-message-feedback` 的 package.json。

## 目标（v2 修订）

把 grill-send-button 升级为**本仓库内自包含的独立 npm 风格包**（不改 deepseek-harness 上游工作区），
自带 `dsh.client` manifest 与构建产物，经 **git 路径（官方插件安装通道）** 可被安装进 dsh profile，
重建并重启 web 后输入栏出现 ⚡ Grill 并可点发消息。验证语义即「装完在 dsh 里能用」。

## 包形态与位置

- 包根与教学源码同体，放在 `examples/grill-send-button/`（本仓库惯例，examples 是权威来源）。
- 在示例内新增独立包所需文件，与既有教学文件共存：

```
examples/grill-send-button/
├── package.json            # name "@smileonroad/dsh-grill-send-button"；type module
│                           #   exports: "." → lib/index.js；"./client" → lib/client.js；"./package.json"
│                           #   dsh.client: { platform: "web" }
│                           #   files: lib/（与 src 一并保留，git 安装拉源码即可用预构建 lib）
├── scripts/build.mjs       # 自包含构建：把 src/client 形态打包成 lib/client.js（无外部依赖，可直接产物化）
├── scripts/verify.mjs      # 静态门禁：校验 name/inject、dsh.client、exports 指向、files 与 lib 存在
├── src/index.ts            # 现有纯函数/契约层（buildGrillSend、GRILL_TRIGGER 等）与 client apply
├── tests/…                 # 现有纯 Node spec + 契约（走 harness examples vitest，命令见下）
└── README.md / README.zh.md
```

- 包内 apply 语义保持现状（React.createElement、inputActions 发送、busy 闸门），只是补上「可安装包」外壳。

## 门禁与测试

- 单元与契约：沿用/扩展纯 Node spec（现有 5 例，必要时加 jsdom 组件级），命令不变，
  在 deepseek-harness 根目录跑 example vitest 配置。
- 包门禁：`scripts/verify.mjs` 覆盖 adding-a-package 中与本包相关的约束子集（name/前缀规范、exports 形状、
  dsh.client 平台、files 完整性、lib 产物存在），并作为安装前自检步骤写进 README。
- 不做上游全仓 constraints/typecheck/lint（本包不属上游工作区）；与上游仓库包不同的是，本包为独立分发，
  用自带 verify + 测试即发布门禁，文档里写明这一取舍。

## 安装与验证

1. 本地先行：把该目录（含预构建 lib）通过官方安装通道装进 web profile（P1 阶段核对 `dsh plugin add` 对本地目录/
   git URL 的确切用法，命令写进 README 分发节与提案附录）。
2. GUI 实测：重建 web bundle 并重启 web 进程，确认输入栏出现 ⚡ Grill、点击经 composer 发预设话术、
   消息在飞时禁用。此步会短暂中断服务，由用户择机执行。
3. git 路径安装：包在本仓库的 git 地址下，文档给出从远端仓库路径安装的确切命令（git 拉源码 + 预构建 lib 均可用，
   依安装器语义二选一，P1 核对后落定）。

## 风险与开放问题

- 独立包命名与上游 `@deepseek-ai/*` 规范解耦，取 `@smileonroad/*` 作用域；是否希望换名可改。
- 「git 路径安装」的确切命令形态（dsh plugin add 对 git URL 的解析、是否需要 prepare 构建）在 P1 用文档与实测核对，
  若 git URL 子目录不可直接安装，则给出等价可用路径（如独立发布到 git 仓库根的包或用 file 安装本地目录），
  并在提案里如实记录。
- 客户端插件要在浏览器生效，仍需 web bundle 重建与重启，无法像动态插件零重启闭环，这点保持诚实标注。

## 交付物

- `examples/grill-send-button/` 内新增独立包文件（package.json / build / verify / 更新 README 分发节）
- 纯 Node spec 扩展 + 可选 jsdom 组件用例
- docs/proposals 归档本提案；docs/README 对应关系按需补记
- 验证录：装进 profile 后 GUI 实况（用户择机执行后回填）
