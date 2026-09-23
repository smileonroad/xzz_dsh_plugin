# 提案：仓库重组为「学习 / 练习」三段，并统一各段内部命名

> 日期 2026-09-23。状态：**已完成**。
> 起因：原顶层按「文件类型」切（`docs` / `notes` / `examples` / `demo` / `reference`），四个名字各自为政、看不出彼此关系，也看不出哪块是**学习**、哪块是**练习**。更麻烦的是 `docs/`、`notes/`、`reference/` 三处内部都是混装的，不拆就是搬个大杂烩。

## 一、最终形态

三段按「先懂、再用、再写」排，各自形状完全一致。

```
xzz-dsh-plugin/
├── README.md / README.zh.md / README.i18n.yaml    总索引
├── CLAUDE.md / LICENSE
├── 01-learn-basics/          DSH 基础学习
│   ├── README.md             notes/ 自写摘要、sources/ 官方材料、examples/ 最小示例
│   ├── notes/                cordis-basics.md
│   ├── sources/              cordis-primer、cordis-tutorial/、architecture
│   └── examples/             （待补）
├── 02-practice-app/          DSH 应用练习
│   ├── README.md             surface 系列索引
│   ├── notes/                7 篇「用 dsh」的笔记
│   ├── sources/              （待补）
│   └── scripts/              原 demo/：零依赖运行器 + cordis 配置
├── 03-practice-plugin/       DSH 插件练习
│   ├── README.md             实战序列表
│   ├── notes/                11 篇实战笔记 + 4 篇插件开发摘要
│   ├── sources/              basic/、cookbook/
│   └── examples/             11 个实战（原 examples/）
└── meta/                     index.md、两份写作规范、proposals/
```

一句话记住段内词汇。**`notes/` 是自己写的，`sources/` 是别人写的，`examples/`（或 `scripts/`）是能跑的。**

## 二、命名规范（已定，写进 CLAUDE.md）

| 位置 | 规则 |
| --- | --- |
| 段目录 | `NN-<slug>/`，两位序号 + kebab-case 英文；`learn-` 学习段、`practice-` 练习段 |
| 段内 | 必有 `README.md`；`notes/` 与 `examples/`（或 `scripts/`）必建；`sources/` 有材料才建 |
| `notes/` | `YYYY-MM-DD-<slug>.md`；有对应实战时 slug 与 `examples/` 项目名一致（`2026-09-17-scripted-llm-adapter.md` ↔ `examples/scripted-llm-adapter/`） |
| `sources/` | **保持上游原文件名与相对路径**，只读 |
| `examples/` | 项目名 kebab-case；必带 `README.md` / `README.zh.md` / `README.i18n.yaml` / `src/` / `tests/<slug>.spec.ts` / `vitest.examples.config.ts` / `LICENSE`；教学示例 patch 叫 `<slug>.patch.yml`，标准 bundle 才叫 `cordis.patch.yml`（被 `package.json` 的 `dsh.bundle.patch` 锁定） |

## 三、拆分的依据

三处混装内容按性质重新归位。

### `notes/`（18 篇）

| 归 02 应用练习（7 篇） | 归 03 插件练习（11 篇） |
| --- | --- |
| `acp`、`headless-cli`、`jsonrpc-sdk-protocol`、`schedule`、`surface-summary`、`web-gui`、`dsh-skill` | `helloworld-command` 到 `scripted-llm-adapter` |

### `docs/`（8 项）

| 去向 | 内容 |
| --- | --- |
| 01 基础学习 | `cordis-basics.md` |
| 03 插件练习 | `adding-a-tool`、`plugin-package`、`plugin-config`、`client-plugin` |
| meta | `README.md` → `index.md`、两份写作规范、`proposals/` |

### `reference/`（15 份）

| 去向 | 内容 |
| --- | --- |
| 01 基础学习 | `cordis-primer.zh.md`、`cordis-tutorial/*`（8）、`architecture.zh.md` |
| 03 插件练习 | `basic/config.md(.zh)`、`cookbook/adding-a-tool`、`adding-a-package`、`adding-a-conversation-node` |

### 另外两处

- `demo/` → `02-practice-app/scripts/`（内容是零依赖运行器加配置文件，叫 `scripts/` 比 `examples/` 准）。
- `notes/README.md`（surface 系列索引）→ `02-practice-app/README.md`，就是这一段的段索引。

## 四、执行结果与验证

- 全部用 `git mv` 搬动，保留文件历史。
- **patch 的相对路径一个字没改**。`examples/<项目>/*.patch.yml` 里 entry 的 `name` 都是 `./src/xxx.ts`，相对声明它的 patch 文件解析，整目录搬动后自动有效。
- **段内相对链接自动保持**。`notes/` 与 `examples/` 在 03 段里仍是同级，`../examples/` 这类链接搬家后照旧成立。
- **修掉两处搬家回归**：`surface-summary` 指向旧笔记索引的位置、`scripted-llm-adapter` 双语 README 指向 `docs/plugin-package.md` 的位置。
- **顺带修掉几处本来就坏的**：应用笔记里 `../../demo/` 多跳了一层（现为 `../scripts/`）。
- 全仓 markdown 相对链接检查通过（只剩两类已知不解析的：`sources/` 里上游原文自带的残缺链接，以及各实战 README 里指向 deepseek-harness 的 `../../docs/user/develop/...`，那些是设计成同步进 harness 后才打开的）。
- 根 `README.md` / `README.zh.md` 双语重写并重记 `README.i18n.yaml` 的 hash；`meta/index.md` 与 `CLAUDE.md` 同步更新。

## 五、遗留

- `01-learn-basics/examples/`（基础概念最小示例）与 `02-practice-app/sources/`（应用侧一手材料）目前是空的，靠后续实战补。
- `02-practice-app/notes/2026-09-02-schedule.md` 里几处指向 harness 源码的链接（`../../packages/schedule/...`）在本仓库里从来不解析，属于设计为「对着 harness 读」的外部引用，这次未动。
- `dsh-skill.md` 暂归应用练习；它讲的是 dsh 自带的 skill 能力，靠近基础学习那一侧，将来若基础段长大可以挪。
