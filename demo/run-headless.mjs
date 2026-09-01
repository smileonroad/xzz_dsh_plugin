#!/usr/bin/env node
/**
 * Headless demo runner: spawns the dsh CLI in headless mode with one task.
 *
 *   node demo/run-headless.mjs "<task>"
 *   node demo/run-headless.mjs --patch demo/model.patch.yml "<task>"
 *
 * The script does three things: parse argv (repeatable --patch), spawn the
 * dsh CLI (`--profile headless`), and pass through the bootstrap-only env.
 * The child's stdout/stderr inherit this terminal, so what you see is what
 * the model said — no protocol layer. The exit code reflects the child's.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * The dsh CLI entry. Works from either checkout: this script lives in
 * `demo/` of the deepseek-harness checkout itself, or in the mirrored
 * xzz-dsh-plugin repo whose sibling checkout is `../deepseek-harness`.
 * Override with the DSH_BIN env var.
 */
const DSH_BIN = process.env.DSH_BIN
  ?? [resolve(here, '../apps/cli/src/bin.ts'),
      resolve(here, '../../deepseek-harness/apps/cli/src/bin.ts')]
    .find(candidate => existsSync(candidate))

// --patch <file> (repeatable); everything else is the task description.
/** @type {string[]} */
const patches = []
/** @type {string[]} */
const rest = []
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]
  if (arg === '--patch') {
    const file = process.argv[++i]
    if (file === undefined) {
      console.error('usage: node demo/run-headless.mjs [--patch <file> ...] "<task>"')
      process.exit(2)
    }
    patches.push(resolve(process.cwd(), file))
  } else {
    rest.push(arg)
  }
}
const task = rest.join(' ')
if (task === '') {
  console.error('usage: node demo/run-headless.mjs [--patch <file> ...] "<task>"')
  process.exit(2)
}

const child = spawn(process.execPath, ['--import', 'tsx', DSH_BIN, '--profile', 'headless',
  ...patches.flatMap(p => ['--patch', p]), task], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL, // bootstrap-only: provided by the launching environment, never .env
    DSH_PERMISSION_MODE: 'danger-full-access', // unattended: auto-approve bash/file tools
  },
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal !== null ? 1 : 0)
})
