#!/usr/bin/env node
/**
 * Static gates for @smileonroad/dsh-grill-send-button.
 *
 * Mirrors the subset of the repo package rules (adding-a-package + client
 * AGENTS) that applies to an independent Client package that doubles as an
 * installable bundle: manifest shape (dsh.bundle + dsh.client), exports point
 * at built files, the shipped bundle layer, the runtime contract of the
 * mounted "." entry (a Cordis plugin — the empty Host half) and of the
 * ./client entry (name / inject / apply and the product constants the tests
 * pin).
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
if (!Array.isArray(pkg.files) || !pkg.files.includes('lib')) fail('files includes lib')
else ok('files includes lib')
if (!Array.isArray(pkg.files) || !pkg.files.includes('cordis.patch.yml')) fail('files includes cordis.patch.yml')
else ok('files includes cordis.patch.yml')
if (pkg.exports?.['.']?.default !== './lib/index.js') fail('exports "." → lib/index.js')
else ok('exports "." default lib/index.js')
if (pkg.exports?.['./client']?.default !== './lib/client.js') fail('exports "./client" → lib/client.js')
else ok('exports "./client" default lib/client.js')
if (pkg.exports?.['./package.json'] !== './package.json') fail('exports "./package.json"')
else ok('exports "./package.json"')

const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
const patchChecks = [
  ['declares an insert block', patch.includes('insert:')],
  ['inserts the row id grill-send-button', patch.includes('id: grill-send-button')],
  ['row names the package itself', patch.includes(`name: '${pkg.name}'`)],
]
for (const [label, passes] of patchChecks) {
  if (passes) ok(`cordis.patch.yml ${label}`)
  else fail(`cordis.patch.yml ${label}`)
}

for (const file of ['lib/index.js', 'lib/client.js']) {
  if (existsSync(join(root, file))) ok(`built ${file} exists`)
  else fail(`built ${file} missing — run npm run build first`)
}

let host
try {
  host = await import(new URL('../lib/index.js', import.meta.url).href)
} catch (error) {
  fail(`"." entry imports as ESM (${error instanceof Error ? error.message : error})`)
}
if (host) {
  if (typeof host.name !== 'string') fail('"." exports a name (Cordis plugin shape)')
  else ok(`"." exports name ${host.name}`)
  if (typeof host.apply !== 'function') fail('"." exports apply (Cordis plugin shape)')
  else ok('"." exports apply (Cordis plugin shape)')
}

let client
try {
  client = await import(new URL('../lib/client.js', import.meta.url).href)
} catch (error) {
  fail(`./client entry imports as ESM (${error instanceof Error ? error.message : error})`)
}
if (client) {
  if (typeof client.name !== 'string') fail('./client exports name')
  else ok(`./client name ${client.name}`)
  if (!Array.isArray(client.inject) || !client.inject.includes('slots')) fail('./client inject includes slots')
  else ok('./client inject slots')
  if (typeof client.apply !== 'function') fail('./client exports apply')
  else ok('./client exports apply')
  if (client.GRILL_TRIGGER !== 'grill me') fail('./client GRILL_TRIGGER contract')
  else ok('./client GRILL_TRIGGER "grill me"')
  if (typeof client.buildGrillSend !== 'function') fail('./client exports buildGrillSend')
  else ok('./client exports buildGrillSend')
}

if (failures.length > 0) {
  console.error(`\nverify failed: ${failures.length} problem(s)`)
  process.exit(1)
}
console.log('\nverify passed')
