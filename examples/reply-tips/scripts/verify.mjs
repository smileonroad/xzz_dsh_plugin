#!/usr/bin/env node
/**
 * Static gates for @smileonroad/dsh-reply-tips.
 *
 * Checks the dual-side package contract end to end without a browser or a live
 * harness: manifest shape (dsh.bundle + dsh.client + the typert/remote exports),
 * the bundle layer row, the generated wire artifacts (three invocations with
 * strict zod codecs), the mountable Host half (Cordis plugin shape), and the
 * browser half in the client-modules factory form — materialized with a react
 * stub to prove it self-mounts its Remote contribution.
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const ok = (label) => console.log(`  ✓ ${label}`)
const fail = (label) => { failures.push(label); console.error(`  ✗ ${label}`) }

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (typeof pkg.name !== 'string' || !pkg.name.startsWith('@')) fail('package name is a scoped npm name')
else ok(`name ${pkg.name}`)
if (pkg.type !== 'module') fail('type is module')
else ok('type module')
if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') fail('dsh.bundle.patch → cordis.patch.yml')
else ok('dsh.bundle.patch ./cordis.patch.yml')
if (pkg.dsh?.client?.platform !== 'web') fail('dsh.client.platform is web')
else ok('dsh.client.platform web')

const exportChecks = [
  ['.', './lib/index.js'],
  ['./client', './lib/client.js'],
  ['./types', './lib/types/types.js'],
  ['./typert', './lib/typert.host.js'],
  ['./remote', './lib/typert.remote-client.js'],
]
for (const [subpath, target] of exportChecks) {
  if (pkg.exports?.[subpath]?.default === target) ok(`exports "${subpath}" default ${target}`)
  else fail(`exports "${subpath}" default ${target}`)
}
const files = Array.isArray(pkg.files) ? pkg.files : []
for (const artifact of ['lib/typert.host.js', 'lib/typert.host.d.ts', 'lib/typert.remote-client.js', 'lib/typert.remote-client.d.ts']) {
  if (files.includes(artifact)) ok(`files includes ${artifact}`)
  else fail(`files includes ${artifact}`)
}

const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
if (patch.includes('insert:') && patch.includes('id: reply-tips') && patch.includes(`name: '${pkg.name}'`)) {
  ok('cordis.patch.yml inserts the row for this package')
} else {
  fail('cordis.patch.yml inserts the row for this package')
}

const artifacts = [
  'lib/index.js', 'lib/client.js', 'lib/types/types.js', 'lib/types/types.d.ts',
  'lib/typert.host.js', 'lib/typert.remote-client.js', 'lib/typert.remote-client.d.ts',
]
for (const file of artifacts) {
  if (existsSync(join(root, file))) ok(`built ${file} exists`)
  else fail(`built ${file} missing — run npm run build first`)
}

// Host wire manifest: three invocations, each with a strict zod codec.
if (existsSync(join(root, 'lib/typert.host.js'))) {
  const hostWire = readFileSync(join(root, 'lib/typert.host.js'), 'utf8')
  const hostWireChecks = [
    ['declares TYPERT', hostWire.includes('export const TYPERT')],
    ['declares face host', hostWire.includes("face: 'host'")],
    ['is owned by this package', hostWire.includes(`package: '${pkg.name}'`)],
    ['carries the get invocation', hostWire.includes(`id: '${pkg.name}#replyTips/get'`)],
    ['carries the set invocation', hostWire.includes(`id: '${pkg.name}#replyTips/set'`)],
    ['carries the get-suggestions invocation', hostWire.includes(`id: '${pkg.name}#replyTips/get-suggestions'`)],
    ['all codecs are strict', !hostWire.includes("mode: 'loose'") && hostWire.includes("mode: 'strict'")],
    ['declares the replyTips service', hostWire.includes('"key": "replyTips"')],
  ]
  for (const [label, passes] of hostWireChecks) {
    if (passes) ok(`typert.host.js ${label}`)
    else fail(`typert.host.js ${label}`)
  }
}

// Client wire contribution: descriptors for the same three methods.
if (existsSync(join(root, 'lib/typert.remote-client.js'))) {
  const remoteWire = readFileSync(join(root, 'lib/typert.remote-client.js'), 'utf8')
  const remoteWireChecks = [
    ['declares TYPERT_REMOTE', remoteWire.includes('export const TYPERT_REMOTE')],
    ['is owned by this package', remoteWire.includes(`package: '${pkg.name}'`)],
    ['describes get', remoteWire.includes("method: 'get'")],
    ['describes set', remoteWire.includes("method: 'set'")],
    ['describes get-suggestions', remoteWire.includes("method: 'get-suggestions'")],
    ['uses strict codecs', remoteWire.includes("mode: 'strict'")],
  ]
  for (const [label, passes] of remoteWireChecks) {
    if (passes) ok(`typert.remote-client.js ${label}`)
    else fail(`typert.remote-client.js ${label}`)
  }
}

// Host half: a mountable Cordis plugin.
let host
try {
  host = await import(new URL('../lib/index.js', import.meta.url).href)
} catch (error) {
  fail(`"." entry imports as ESM (${error instanceof Error ? error.message : error})`)
}
if (host) {
  if (host.name === 'reply-tips') ok('"." exports name reply-tips')
  else fail('"." exports name reply-tips')
  if (typeof host.apply === 'function') ok('"." exports apply (Cordis plugin shape)')
  else fail('"." exports apply (Cordis plugin shape)')
  if (typeof host.ReplyTipsService === 'function') ok('"." exports ReplyTipsService (typert owner)')
  else fail('"." exports ReplyTipsService (typert owner)')
  if (typeof host.parseModelOutput === 'function' && typeof host.latestTurnPair === 'function') {
    ok('"." re-exports the pure core')
  } else {
    fail('"." re-exports the pure core')
  }
}

// Browser half: factory registration + self-mount of the Remote contribution.
if (existsSync(join(root, 'lib/client.js'))) {
  const clientSource = readFileSync(join(root, 'lib/client.js'), 'utf8')
  const clientShape = [
    ['registers via window.__ModuleLoader__.load', clientSource.includes('window.__ModuleLoader__.load({')],
    [`registers the package id ${pkg.name}`, clientSource.includes(`id: ${JSON.stringify(pkg.name)}`)],
    ['factory takes react from the module table', clientSource.includes('require("react")')],
    ['inlines the wire layer (no external zod)', !clientSource.includes('require("zod")')],
  ]
  for (const [label, passes] of clientShape) {
    if (passes) ok(`./client ${label}`)
    else fail(`./client ${label}`)
  }

  let registration
  globalThis.window = { __ModuleLoader__: { load: (value) => { registration = value } } }
  try {
    await import(new URL('../lib/client.js', import.meta.url).href)
  } catch (error) {
    fail(`./client bundle evaluates (${error instanceof Error ? error.message : error})`)
  }
  if (registration === undefined) {
    fail('./client calls __ModuleLoader__.load at evaluation')
  } else {
    ok('./client calls __ModuleLoader__.load at evaluation')
    let client
    try {
      client = registration.factory((spec) => {
        if (spec === 'react') return { createElement: () => null, useState: () => [undefined, () => {}], useEffect: () => {}, useMemo: (fn) => fn(), useRef: () => ({ current: undefined }) }
        throw new Error(`unexpected require("${spec}")`)
      })
    } catch (error) {
      fail(`./client factory materializes (${error instanceof Error ? error.message : error})`)
    }
    if (client !== undefined) {
      const mounts = []
      const ctx = {
        get: () => undefined,
        remote: {
          $mount: async (contribution) => { mounts.push(contribution); return async () => {} },
          replyTips: {
            get: async () => ({ ok: true, value: { enabled: false } }),
            set: async () => ({ ok: true, value: { enabled: true, saved: true } }),
            'get-suggestions': async () => ({ ok: true, value: { suggestions: [], reason: null, state: 'idle' } }),
          },
        },
      }
      try {
        await client.apply(ctx)
      } catch (error) {
        fail(`./client apply runs (${error instanceof Error ? error.message : error})`)
      }
      if (mounts.length === 1 && mounts[0]?.package === pkg.name) ok('./client self-mounts its Remote contribution')
      else fail('./client self-mounts its Remote contribution')
      if (Array.isArray(client.inject) && ['slots', 'timer', 'remote'].every(key => client.inject.includes(key))) {
        ok('./client injects slots/timer/remote')
      } else {
        fail('./client injects slots/timer/remote')
      }
      if (client.name === 'reply-tips') ok('./client name reply-tips')
      else fail('./client name reply-tips')
    }
  }
}

if (failures.length > 0) {
  console.error(`\nverify failed: ${failures.length} problem(s)`)
  process.exit(1)
}
console.log('\nverify passed')
