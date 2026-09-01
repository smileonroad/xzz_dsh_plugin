#!/usr/bin/env node
/**
 * Zero-dependency minimal ACP client: spawns the dsh ACP server
 * (acp-demo bin + demo/cordis.local.yml) and drives the four-step protocol:
 *
 *   initialize → session/new → session/prompt (streaming) → EOF
 *
 *   node demo/acp-mini-client.mjs "<task>"
 *
 * Stdout of the server carries only ACP JSON-RPC lines; diagnostics go to
 * stderr, so the child's stderr inherits this terminal while stdout is
 * framed line-by-line.
 *
 * KEY: do NOT set DEEPSEEK_API_KEY in the spawn env — acp-demo's loadEnv
 * loads the root .env and does NOT overwrite existing env vars, so a
 * placeholder key would shadow the real one (401). Pass ...process.env
 * through untouched and let loadEnv find the real key.
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import readline from 'node:readline'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Borrow DEEPSEEK_API_KEY from the global dsh credential store when the
 * launching environment has none (the acp composition mounts no credentials
 * service). A PLACEHOLDER key is still forbidden — loadEnv does not overwrite
 * existing env vars, so a fake key would shadow the real one (401).
 */
function globalApiKey() {
  if (process.env.DEEPSEEK_API_KEY) return undefined
  try {
    const text = readFileSync(resolve(homedir(), '.dsh/.credentials.yaml'), 'utf8')
    return text.match(/DEEPSEEK_API_KEY:\s*["']?([^"'\s]+)/)?.[1]
  } catch {
    return undefined
  }
}

/** The ACP server bin (deepseek-harness checkout); override with ACP_BIN. */
const ACP_BIN = process.env.ACP_BIN
  ?? [resolve(here, '../packages/examples/acp-demo/src/bin.ts'),
      resolve(here, '../../deepseek-harness/packages/examples/acp-demo/src/bin.ts')]
    .find(candidate => existsSync(candidate))
/** Local overlay of examples/acp-agent/cordis.yml (see header of that file). */
const ACP_CONFIG = resolve(here, 'cordis.local.yml')

const task = process.argv.slice(2).join(' ')
if (task === '') {
  console.error('usage: node demo/acp-mini-client.mjs "<task>"')
  process.exit(2)
}

// Step 1: spawn the server. stdout is pipe (protocol), stderr inherits.
const child = spawn(process.execPath, ['--import', 'tsx', ACP_BIN, '--config', ACP_CONFIG], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    // Bootstrap-only: provided by the launching environment, never .env.
    DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
    // Unattended: auto-approve bash/file tool permission requests.
    DSH_PERMISSION_MODE: 'danger-full-access',
    // Real key only when the environment lacks one; never a placeholder.
    ...(globalApiKey() ? { DEEPSEEK_API_KEY: globalApiKey() } : {}),
  },
  stdio: ['pipe', 'pipe', 'inherit'],
})

// Step 2: line-framed JSON-RPC over stdin/stdout.
let nextId = 0
/** @type {Map<number, (frame: any) => void>} */
const pending = new Map()

const rl = readline.createInterface({ input: child.stdout })
rl.on('line', line => {
  let frame
  try {
    frame = JSON.parse(line)
  } catch {
    return // not JSON (should not happen on a protocol-pure stdout)
  }
  if (frame.id !== undefined && pending.has(frame.id)) {
    pending.get(frame.id)(frame)
    pending.delete(frame.id)
  } else if (frame.method === 'session/update') {
    // Streaming notification: the ACP bridge puts model deltas in
    // update.content (text blocks), NOT update.message.content.
    const update = frame.params?.update
    if (update?.sessionUpdate === 'agent_message_chunk') {
      const block = update.content
      const text = typeof block === 'string' ? block : block?.text
      if (text) process.stdout.write(text)
    }
  }
})

function request(method, params) {
  const id = ++nextId
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  return new Promise(resolve => pending.set(id, resolve))
}

// Step 3: the four-step protocol.
const init = await request('initialize', {
  protocolVersion: 1,
  clientCapabilities: {},
  clientInfo: { name: 'acp-mini-client', version: '0.0.1' },
})
console.log('① initialize → 服务器:', init.result?.agentInfo?.name ?? JSON.stringify(init.result))

const created = await request('session/new', {
  cwd: process.cwd(),
  additionalDirectories: [],
  mcpServers: [],
})
const sessionId = created.result?.sessionId
console.log('② session/new → sessionId:', sessionId)

console.log(`③ session/prompt → 「${task}」`)
process.stdout.write('   模型回答（流式）: ')
const done = await request('session/prompt', {
  sessionId,
  prompt: [{ type: 'text', text: task }],
})
process.stdout.write('\n④ prompt 完成，stopReason = ' + done.result?.stopReason + '\n')

// Step 4: EOF lets the server dispose and exit.
child.stdin.end()
await new Promise(resolve => child.on('exit', resolve))
