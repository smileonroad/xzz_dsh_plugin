#!/usr/bin/env node
/**
 * Web runner: spawns the dsh web server, by default with the web-cordis
 * self-referential overlay (agent can inspect its own Cordis process and
 * mount/unmount model-authored plugins in memory), plus optional extra
 * overlays.
 *
 *   node demo/run-web.mjs                    # web-cordis demo, port 3081
 *   node demo/run-web.mjs --patch <file>     # extra overlays (repeatable)
 *   node demo/run-web.mjs --no-cordis        # plain web, no tool-cordis
 *
 * No DSH_PERMISSION_MODE: web is the human-in-the-loop surface, permissions
 * are confirmed in the browser. Long-running process; Ctrl+C to exit.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

/** The dsh CLI entry (adjacent deepseek-harness checkout by default). */
const DSH_BIN = process.env.DSH_BIN
  ?? [resolve(here, '../apps/cli/src/bin.ts'),
      resolve(here, '../../deepseek-harness/apps/cli/src/bin.ts')]
    .find(candidate => existsSync(candidate))

/** The local web overlay (pins port 3081; tool-cordis already ships in the
 * dsh-web-app bundle, so the upstream overlay's inserts would duplicate). */
const CORDIS_OVERLAY = resolve(here, 'web-cordis.local.yml')

let skipCordis = false
/** @type {string[]} */
const patches = []
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]
  if (arg === '--patch') {
    const file = process.argv[++i]
    if (file === undefined) {
      console.error('usage: node demo/run-web.mjs [--patch <file> ...] [--no-cordis]')
      process.exit(2)
    }
    patches.push(resolve(process.cwd(), file))
  } else if (arg === '--no-cordis') {
    skipCordis = true
  } else {
    console.error('usage: node demo/run-web.mjs [--patch <file> ...] [--no-cordis]')
    process.exit(2)
  }
}

console.log('[demo/run-web.mjs] 浏览器打开 http://127.0.0.1:3081 （Ctrl+C 退出）')
// NOTE: the launcher's flags (— patch, --dump-config) must come BEFORE the
// app's own flags (--no-open): passThroughOptions hands everything after the
// first unknown option to the app, so `--no-open --patch x` would make the
// APP reject --patch (unknown option). --no-open: the demo prints the URL
// itself; auto-opening the browser can hang headless/redirected boots.
const child = spawn(process.execPath, ['--import', 'tsx/esm', DSH_BIN, 'web',
  ...(skipCordis ? [] : ['--patch', CORDIS_OVERLAY]),
  ...patches.flatMap(p => ['--patch', p]),
  '--no-open'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    // Bootstrap-only: provided by the launching environment, never .env.
    DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
    // No DSH_PERMISSION_MODE — web is the human-in-the-loop surface.
  },
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal !== null ? 1 : 0)
})
