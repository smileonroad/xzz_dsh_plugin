#!/usr/bin/env node
/**
 * 离线演示：不联网、不要 API key，也不会碰你真实的 ~/.dsh。
 *
 *   node examples/scripted-llm-adapter/scripts/demo.mjs "你好"
 *
 * 做法是给这次运行造一个**一次性 DSH_HOME**，在里面同时写两样东西：
 *
 * 1. `settings.yaml` —— 把 `agent-default-model` 指到剧本适配器的 `scripted/demo`。
 *    这一步不能省：真实的 `~/.dsh/settings.yaml` 里已经有用户的模型选择，
 *    而 settings 是叠在组合配置之上的用户层，直接改 profile 的配置会被它盖掉。
 * 2. 一个 overlay patch —— 把适配器这一行插进组合树。
 *
 * 退出时删掉整个临时 home，所以这个演示不会留下任何痕迹。
 *
 * harness checkout 通过 `DSH_HARNESS` 指定，缺省取本示例所在目录的上两级
 * （示例就在 `<harness>/examples/scripted-llm-adapter` 时的布局）。
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const harness = resolve(process.env.DSH_HARNESS ?? join(root, '..', '..'))
const bin = join(harness, 'apps', 'cli', 'src', 'bin.ts')
const example = join(harness, 'examples', 'scripted-llm-adapter')
/** 这次演示要挂的两个插件：提供方本体，和它前面的敏感词拦截层。 */
const entries = [
  ['scripted-llm', 'src/index.ts'],
  ['prompt-guard', 'src/guard.ts'],
]
const task = process.argv.slice(2).join(' ') || '你好，介绍一下你自己'

function fail(message) {
  console.error(`demo: ${message}`)
  process.exit(1)
}

if (!existsSync(bin)) {
  fail(`没找到 harness 的 CLI（${bin}）。本示例所在目录的上两级不是一个 harness checkout 时，请设 DSH_HARNESS 指向它`)
}
if (!existsSync(join(example, 'src', 'index.ts'))) {
  fail(`没找到 ${example}。先把本仓库的 examples/scripted-llm-adapter 整个拷到 harness 的 examples/ 下再跑`)
}

// tsx 从 harness 解析，这样调用者的工作目录可以保持不变（也就是 agent 的工作目录）。
// `--import` 只接受 URL，Windows 上绝对路径要转成 file:// 形式。
const tsx = (() => {
  try {
    return pathToFileURL(createRequire(join(harness, 'package.json')).resolve('tsx')).href
  } catch {
    return 'tsx'
  }
})()

const home = mkdtempSync(join(tmpdir(), 'dsh-scripted-'))
const patch = join(home, 'scripted.patch.yml')

// 入口名用 file:// URL：patch 行里的相对路径是按 patch 文件所在目录解析的，
// 这个临时 home 里并没有 examples 目录，写绝对 URL 最省事（Windows 也认）。
writeFileSync(patch, [
  '# 由 examples/scripted-llm-adapter/scripts/demo.mjs 生成的一次性 overlay。',
  '- insert:',
  ...entries.flatMap(([id, relative]) => [
    `    - id: ${id}`,
    `      name: '${pathToFileURL(join(example, relative)).href}'`,
  ]),
  '',
].join('\n'))

// settings 层盖在组合配置之上，所以模型选择写在这里，而不是写进 profile 的配置。
writeFileSync(join(home, 'settings.yaml'), [
  'agent-default-model:',
  '  provider: scripted',
  '  model: demo',
  '',
].join('\n'))

console.log(`demo: DSH_HOME=${home}`)
const child = spawn(process.execPath, [
  '--import', tsx, bin,
  '--profile', 'headless',
  '--patch', patch,
  task,
], { stdio: 'inherit', env: { ...process.env, DSH_HOME: home } })

child.on('exit', (code, signal) => {
  rmSync(home, { recursive: true, force: true })
  process.exitCode = code ?? (signal === null ? 1 : 0)
})
