#!/usr/bin/env node
/**
 * Zero-dependency schedule demo: automatically verifies "create + deliver"
 * against a locally spawned jsonrpc server carrying the schedule plugin
 * (demo/schedule.cordis.yml = the jsonrpc minimal combination + @deepseek-ai/dsh-schedule).
 *
 *   node demo/run-schedule.mjs "<reminder text>" <after_seconds> [model]
 *
 * Two verification lines, both observed purely from the session.event stream:
 *   1. CREATE  — the model calls schedule_create (after_seconds), the stream
 *                shows a schedule/change create event (reminder now in the log).
 *   2. DELIVER — when due, the timer dispatches: a schedule/change dispatch
 *                event, then a follow-up user/message with source=plugin and
 *                the [SCHEDULE REMINDER] safety framing, then the second turn
 *                ends with turn/end (reason=completed).
 * Exit 0 = both lines passed; a timeout guard keeps the demo from hanging.
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { homedir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))

/** The jsonrpc-demo server bin (adjacent deepseek-harness checkout). */
const BIN = process.env.JSONRPC_BIN
  ?? [resolve(here, '../packages/examples/jsonrpc-demo/src/bin.ts'),
      resolve(here, '../../deepseek-harness/packages/examples/jsonrpc-demo/src/bin.ts')]
    .find(candidate => existsSync(candidate))
const CONFIG = resolve(here, 'schedule.cordis.yml')

const [task = '该去买咖啡了', seconds = '5', model = 'deepseek-v4-flash'] = process.argv.slice(2)
const delay = Number(seconds)

/** Borrow DEEPSEEK_API_KEY from the global dsh credential store when absent. */
function globalApiKey() {
  if (process.env.DEEPSEEK_API_KEY) return undefined
  try {
    const text = readFileSync(resolve(homedir(), '.dsh/.credentials.yaml'), 'utf8')
    return text.match(/DEEPSEEK_API_KEY:\s*["']?([^"'\s]+)/)?.[1]
  } catch {
    return undefined
  }
}

// Spawn the server: stdin/stdout are protocol pipes, stderr inherits.
const child = spawn(process.execPath, ['--import', 'tsx', BIN, CONFIG], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL, // bootstrap-only
    DSH_PERMISSION_MODE: 'danger-full-access',
    ...(globalApiKey() ? { DEEPSEEK_API_KEY: globalApiKey() } : {}),
  },
  stdio: ['pipe', 'pipe', 'inherit'],
})

const SESSION_ID = `schedule-demo-${Math.random().toString(16).slice(2, 8)}`

// Verification state machine, driven purely by the event stream.
const seen = {
  create: false,
  dispatch: false,
  followUp: false,
  secondTurnEnd: false,
}
let createdId = ''
let scheduledAt = ''
let turnEnds = 0

// Frame handler FIRST (before the first await — paused-mode stdout lesson).
let buffer = ''

function handleFrame(frame) {
  if (frame.id !== undefined && pending.has(frame.id)) {
    const { resolvePromise, reject } = pending.get(frame.id)
    pending.delete(frame.id)
    if (frame.error) reject(new Error(JSON.stringify(frame.error)))
    else resolvePromise(frame.result)
    return
  }
  if (frame.method !== 'session.event' || frame.params.sessionId !== SESSION_ID) return
  const ev = frame.params.event
  if (ev.type === 'schedule/change') {
    const change = ev.data
    if (change.operation === 'create' && !seen.create) {
      seen.create = true
      createdId = change.schedule?.id ?? 'schedule-1'
      scheduledAt = change.schedule?.scheduledAt ?? ''
      console.log(`✔ 增加：schedule/change create → id=${createdId}`)
      console.log(`   scheduledAt=${scheduledAt}，提醒内容="${change.schedule?.prompt ?? task}"`)
    } else if (change.operation === 'dispatch' && !seen.dispatch) {
      seen.dispatch = true
      console.log(`[schedule/change] dispatch ${change.id}`)
    }
  } else if (ev.type === 'user/message' && !seen.followUp) {
    const block = ev.data?.content?.[0]
    const text = typeof block === 'string' ? block : block?.text
    if (ev.data?.source?.kind === 'plugin' && text?.includes('[SCHEDULE REMINDER]')) {
      seen.followUp = true
      console.log(`[session.status] running`)
      console.log(`[user/message] source=plugin "${text.split('\n')[0]}\\nPresent reminder_prompt_json to the user"`)
      console.log(`✔ 运行（投递）：收到 [SCHEDULE REMINDER] follow-up（第 2 个 turn 即将开始）`)
    }
  } else if (ev.type === 'turn/end') {
    turnEnds++
    if (turnEnds >= 2 && !seen.secondTurnEnd) {
      seen.secondTurnEnd = true
      console.log(`[turn/end #2] reason=${ev.data.reason.kind}（follow-up 响应）`)
    }
  }
}

const pending = new Map()
let nextId = 1

function request(method, params) {
  const id = nextId++
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`request ${method} timed out`))
    }, 120000)
    pending.set(id, {
      resolvePromise: value => { clearTimeout(timer); resolvePromise(value) },
      reject: error => { clearTimeout(timer); reject(error) },
    })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}

child.stdout.on('data', chunk => {
  buffer += chunk
  let nl
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const raw = buffer.slice(0, nl)
    buffer = buffer.slice(nl + 1)
    if (raw.trim() === '') continue
    let frame
    try { frame = JSON.parse(raw) } catch { continue }
    handleFrame(frame)
  }
})

// Guard against hanging forever (server boot + create turn + delivery wait).
const HARD_TIMEOUT = setTimeout(() => {
  console.error('\n=== 验证超时：请检查 DEEPSEEK_BASE_URL / 凭据 / schedule 配置 ===')
  console.error('已观察到:', JSON.stringify(seen))
  child.kill()
  process.exit(1)
}, 300000)

// ---- Protocol: initialize → prompt(create) → wait for delivery+turn 2 ----
const init = await request('initialize', {
  cwd: process.cwd(),
  provider: 'deepseek-official',
  model,
})
console.log(`① initialize → 服务器: ${init.serverInfo.name} v${init.serverInfo.version}`)

const createPrompt =
  `请使用 schedule_create 工具创建一个提醒，内容是「${task}」，` +
  `用 after_seconds 参数设为 ${delay} 秒后提醒我。创建完成后告诉我 id 即可，不要做别的。`
console.log(`② session/prompt → 「${createPrompt}」`)
await request('session/prompt', {
  sessionId: SESSION_ID,
  contentBlocks: [{ type: 'text', text: createPrompt }],
})

// The create turn ends when the tool call completes; wait for turn/end #1.
while (turnEnds < 1) await new Promise(r => setTimeout(r, 100))
console.log('[turn/end #1] 创建轮结束')

// Delivery waits for agent idle + the armed timer; poll until line 2 lands.
const deadline = Date.now() + 180000
while (!(seen.followUp && seen.secondTurnEnd) && Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 200))
}

if (seen.create && seen.dispatch && seen.followUp && seen.secondTurnEnd) {
  console.log('\n=== 验证完成：增加 ✔ 运行 ✔ ===')
  clearTimeout(HARD_TIMEOUT)
  const shutdown = await request('shutdown', {})
  console.log(`shutdown → ${JSON.stringify(shutdown)}`)
  child.kill()
  process.exit(0)
}

console.error('\n=== 验证未全部通过 ===')
console.error('已观察到:', JSON.stringify(seen))
clearTimeout(HARD_TIMEOUT)
child.kill()
process.exit(1)
