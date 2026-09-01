#!/usr/bin/env node
/**
 * Zero-dependency minimal JSON-RPC agent client.
 *
 *   node demo/jsonrpc-mini-client.mjs "<task>" [model]
 *
 * It spawns the SDK's jsonrpc-demo server locally, drives the 3-method
 * protocol (initialize / session/prompt / shutdown), and assembles the answer
 * from the session.event notification stream. The model is a PROTOCOL
 * parameter — swap models by changing the second CLI argument, no config
 * edits. stdin/stdout are the protocol pipes; stderr passes diagnostics.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

/** The jsonrpc-demo server bin (adjacent deepseek-harness checkout). */
const BIN = process.env.JSONRPC_BIN
  ?? [resolve(here, '../packages/examples/jsonrpc-demo/src/bin.ts'),
      resolve(here, '../../deepseek-harness/packages/examples/jsonrpc-demo/src/bin.ts')]
    .find(candidate => existsSync(candidate))
const CONFIG = resolve(here, 'jsonrpc.cordis.yml')

const [task, model = 'deepseek-v4-flash'] = process.argv.slice(2)
if (!task) {
  console.error('usage: node demo/jsonrpc-mini-client.mjs "<task>" [model]')
  process.exit(2)
}

// 1) Spawn the server: stdin/stdout are the protocol pipes.
const child = spawn(process.execPath, ['--import', 'tsx', BIN, CONFIG], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL, // bootstrap-only, provided by the launching environment
    DSH_PERMISSION_MODE: 'danger-full-access',
  },
  stdio: ['pipe', 'pipe', 'inherit'],
})

const lines = readline.createInterface({ input: child.stdout })
const pending = new Map()
let nextId = 1

/** Send one request, resolve on the matching response id. */
function request(method, params) {
  const id = nextId++
  return new Promise((resolvePromise, reject) => {
    pending.set(id, { resolvePromise, reject })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}

const SESSION_ID = `demo-${Math.random().toString(16).slice(2, 8)}`

// 2) The 3-method protocol. Model routing is an initialize PARAM.
const init = await request('initialize', {
  cwd: process.cwd(),
  provider: 'deepseek-official',
  model,
})
console.log(`① initialize → 服务器: ${init.serverInfo.name} v${init.serverInfo.version}`)
console.log(`   sessionId = ${SESSION_ID}（客户端自选，惰性创建）`)

const prompt = await request('session/prompt', {
  sessionId: SESSION_ID,
  contentBlocks: [{ type: 'text', text: task }],
})
console.log(`② session/prompt → 「${task}」（model=${model}）`)

// 3) Assemble the answer from the event stream.
let finished = false
lines.on('line', raw => {
  const frame = JSON.parse(raw)
  if (frame.id !== undefined && pending.has(frame.id)) {
    const { resolvePromise, reject } = pending.get(frame.id)
    pending.delete(frame.id)
    if (frame.error) reject(new Error(JSON.stringify(frame.error)))
    else resolvePromise(frame.result)
    return
  }
  if (frame.method === 'session.event' && frame.params.sessionId === SESSION_ID) {
    const ev = frame.params.event
    if (ev.type === 'assistant/chunk') {
      const chunk = ev.data.chunk
      if (chunk.type === 'text-delta') process.stdout.write(chunk.text)
      else if (chunk.type === 'reasoning-delta') process.stdout.write(`\n[reasoning] ${chunk.text}`)
    } else if (ev.type === 'turn/end') {
      // reason is a discriminated OBJECT; take .kind.
      console.log(`\n③ 完成信号: turn/end (reason=${ev.data.reason.kind})`)
      finished = true
    }
  }
})

// Wait for the turn to finish, then shut down cleanly.
while (!finished) await new Promise(r => setTimeout(r, 50))
const shutdown = await request('shutdown', {})
console.log(`④ shutdown → ${JSON.stringify(shutdown)}`)
child.kill()
process.exit(0)
