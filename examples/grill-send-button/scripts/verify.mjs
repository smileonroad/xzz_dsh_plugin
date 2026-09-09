#!/usr/bin/env node
/**
 * Static gates for @smileonroad/dsh-grill-send-button.
 *
 * Mirrors the subset of the repo package rules (adding-a-package + client
 * AGENTS) that applies to an independent Client package that doubles as an
 * installable bundle: manifest shape (dsh.bundle + dsh.client), exports point
 * at built files, the shipped bundle layer, the runtime contract of the
 * mounted "." entry (a Cordis plugin — the empty Host half) and of the
 * ./client entry in the dsh client-modules factory format
 * (window.__ModuleLoader__.load({ id, factory }) — the shape the in-box
 * tsdown client preset emits; a plain ESM module never registers and the
 * loader rejects the whole phase batch).
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

// ./client is a dsh client-plugin bundle: one top-level __ModuleLoader__.load
// registration. Static shape first, then a behavioural run of the factory.
const clientSource = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
const clientShape = [
  ['registers via window.__ModuleLoader__.load', clientSource.includes('window.__ModuleLoader__.load({')],
  [`registers the package id ${pkg.name}`, clientSource.includes(`id: ${JSON.stringify(pkg.name)}`)],
  ['factory requires react from the module table', clientSource.includes('const React = require("react")')],
  ['export map carries GRILL_TRIGGER', /\bGRILL_TRIGGER:\s*\(\) => GRILL_TRIGGER/.test(clientSource)],
  ['export map carries buildGrillSend', /\bbuildGrillSend:\s*\(\) => buildGrillSend/.test(clientSource)],
  ['export map carries apply', /\bapply:\s*\(\) => apply/.test(clientSource)],
  ['export map carries inject', /\binject:\s*\(\) => inject/.test(clientSource)],
  ['export map carries name', /\bname:\s*\(\) => name/.test(clientSource)],
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
if (!registration) {
  fail('./client calls __ModuleLoader__.load at evaluation')
} else {
  ok('./client calls __ModuleLoader__.load at evaluation')
  let client
  try {
    client = registration.factory((spec) => {
      if (spec === 'react') return { createElement: () => null }
      throw new Error(`unexpected require("${spec}")`)
    })
  } catch (error) {
    fail(`./client factory materializes (${error instanceof Error ? error.message : error})`)
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
    if (client.buildGrillSend(false) !== 'grill me') fail('./client buildGrillSend(false) → trigger')
    else ok('./client buildGrillSend(false) → trigger')
    if (client.buildGrillSend(true) !== null) fail('./client buildGrillSend(true) → null (busy)')
    else ok('./client buildGrillSend(true) → null (busy)')
  }
}

if (failures.length > 0) {
  console.error(`\nverify failed: ${failures.length} problem(s)`)
  process.exit(1)
}
console.log('\nverify passed')
