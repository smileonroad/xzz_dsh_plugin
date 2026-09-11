#!/usr/bin/env node
/**
 * Self-contained build for @smileonroad/dsh-reply-tips.
 *
 * Four artifacts, in order:
 *
 * 1. wire (`lib/typert.host.js` + `lib/typert.remote-client.js`) — emitted by
 *    @deepseek-ai/dsh-typert-generator. The generator only accepts packages
 *    under `<harness>/packages/`, so this script stages a copy there plus
 *    aggregate tsconfigs, runs the analyzer/emitter public API, copies the
 *    artifacts back, and removes the staging. The protocol package must be
 *    registered in the same workspace for @Remote to be recognised.
 * 2. `lib/index.js` — the Host half (plain ESM; bare imports stay external and
 *    resolve from the harness install at runtime).
 * 3. `lib/types/types.js` + `.d.ts` — the public wire-type subpath (the source
 *    is interfaces only, so the `.d.ts` is a copy).
 * 4. `lib/client.js` — the browser half in the dsh client-modules factory form
 *    (`window.__ModuleLoader__.load`), with the generated Remote contribution
 *    and zod inlined and react taken from the module table.
 *
 * The harness checkout is found via `DSH_HARNESS`, defaulting to two levels up
 * (the layout when this package sits in `<harness>/examples/reply-tips`).
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const harness = resolve(process.env.DSH_HARNESS ?? join(root, '..', '..'))
const staged = join(harness, 'packages', 'reply-tips')
const aggregate = join(harness, '.typert-reply-tips')

function fail(message) {
  console.error(`build: ${message}`)
  process.exit(1)
}

if (!existsSync(join(harness, 'packages', 'typert', 'protocol', 'tsconfig.json'))) {
  fail(`deepseek-harness checkout not found at ${harness}; set DSH_HARNESS to its root`)
}
if (existsSync(staged)) fail(`${staged} already exists; remove it before building`)

function pnpmPackageDir(name) {
  const pnpmDir = join(harness, 'node_modules', '.pnpm')
  if (!existsSync(pnpmDir)) return undefined
  const candidates = readdirSync(pnpmDir)
    .filter(entry => entry.startsWith(`${name}@`))
    .sort()
  for (const entry of candidates.reverse()) {
    const dir = join(pnpmDir, entry, 'node_modules', name)
    if (existsSync(join(dir, 'package.json'))) return dir
  }
  return undefined
}

function esbuildPath() {
  if (process.env.ESBUILD_BIN) return process.env.ESBUILD_BIN
  const local = join(root, 'node_modules', 'esbuild', 'bin', 'esbuild')
  if (existsSync(local)) return local
  const direct = join(harness, 'node_modules', 'esbuild', 'bin', 'esbuild')
  if (existsSync(direct)) return direct
  const pnpm = pnpmPackageDir('esbuild')
  if (pnpm !== undefined) return join(pnpm, 'bin', 'esbuild')
  return 'esbuild'
}

/** zod is not hoisted in the pnpm layout, so the client bundle aliases it explicitly. */
function zodPath() {
  const local = join(root, 'node_modules', 'zod')
  if (existsSync(local)) return local
  const pnpm = pnpmPackageDir('zod')
  if (pnpm !== undefined) return pnpm
  fail('zod not found; install it locally or provide it in the harness checkout')
}

function compile(entry, outfile, format, extra = []) {
  execFileSync(process.execPath, [
    esbuildPath(), entry,
    `--outfile=${outfile}`, `--format=${format}`, '--target=es2022', ...extra,
  ], { cwd: root, stdio: 'inherit' })
}

// ── 1. wire artifacts through the typert generator ─────────────────────────
async function generateWire() {
  rmSync(aggregate, { recursive: true, force: true })
  mkdirSync(aggregate, { recursive: true })
  // `lib/` is kept: the committed generated declarations are what the client
  // source typechecks against before this pass rewrites them (same bootstrap as
  // the in-box packages, whose generated artifacts are committed).
  cpSync(root, staged, { recursive: true, filter: (source) => !source.includes(`${join(root, 'node_modules')}`) })

  for (const face of ['host', 'client']) {
    writeFileSync(join(aggregate, `tsconfig.${face}.json`), `${JSON.stringify({
      extends: '../tsconfig.base.json',
      compilerOptions: { noEmit: true, composite: false, rewriteRelativeImportExtensions: false },
      references: [
        { path: '../packages/reply-tips/tsconfig.json' },
        { path: '../packages/typert/protocol/tsconfig.json' },
      ],
    }, null, 2)}\n`)
  }

  const gen = await import(pathToFileURL(join(harness, 'packages', 'typert', 'generator', 'lib', 'index.js')).href)
  const analyzer = new gen.WorkspaceAnalyzer({
    root: harness,
    hostConfig: '.typert-reply-tips/tsconfig.host.json',
    clientConfig: '.typert-reply-tips/tsconfig.client.json',
    checkDiagnostics: true,
  })
  const workspace = analyzer.analyze()
  const artifacts = []
  for (const face of workspace.faces) {
    const emitter = new gen.FaceModelEmitter(face)
    for (const model of face.packages) {
      const artifact = emitter.emit(model.name)
      if (artifact.package === pkg.name) artifacts.push(artifact)
    }
  }
  const host = artifacts.find(artifact => artifact.face === 'host')
  if (host === undefined) fail('the generator emitted no host artifact for this package')
  mkdirSync(join(root, 'lib'), { recursive: true })
  const written = [
    ['typert.host.js', host.js],
    ['typert.host.d.ts', host.dts],
  ]
  if (host.remote !== undefined) {
    written.push(
      ['typert.remote-client.js', host.remote.js],
      ['typert.remote-client.d.ts', host.remote.dts],
      ['typert.remote-client.d.ts.map', host.remote.dtsMap],
    )
  }
  for (const [name, body] of written) writeFileSync(join(root, 'lib', name), body)
  console.log(`wire: ${written.map(([name, body]) => `${name} (${body.length}b)`).join(', ')}`)
}

// ── 2..4 plain artifacts ───────────────────────────────────────────────────
function buildHost() {
  compile(join(root, 'src', 'index.ts'), join(root, 'lib', 'index.js'), 'esm', ['--bundle', '--packages=external', '--log-level=warning'])
}

function buildTypes() {
  mkdirSync(join(root, 'lib', 'types'), { recursive: true })
  compile(join(root, 'src', 'types.ts'), join(root, 'lib', 'types', 'types.js'), 'esm', ['--log-level=warning'])
  copyFileSync(join(root, 'src', 'types.ts'), join(root, 'lib', 'types', 'types.d.ts'))
}

function buildClient() {
  const tmp = join(root, 'lib', '.client.cjs.tmp')
  compile(join(root, 'src', 'client.ts'), tmp, 'cjs', [
    '--bundle', '--minify', '--external:react', `--alias:zod=${zodPath()}`, '--log-level=warning',
  ])
  const body = readFileSync(tmp, 'utf8').trimEnd()
  writeFileSync(join(root, 'lib', 'client.js'), [
    '// Generated by scripts/build.mjs — dsh client-plugin bundle (__ModuleLoader__ factory form). Do not edit.',
    'window.__ModuleLoader__.load({',
    `  id: ${JSON.stringify(pkg.name)},`,
    '  factory: (require) => {',
    '    const module = { exports: {} };',
    '    const exports = module.exports;',
    '    const React = require("react");',
    body,
    '    return module.exports;',
    '  },',
    '});',
    '',
  ].join('\n'))
  rmSync(tmp)
  console.log('client: lib/client.js (loader factory form)')
}

try {
  await generateWire()
  buildHost()
  buildTypes()
  buildClient()
  console.log('built lib/index.js, lib/types/types.js, lib/client.js and the wire artifacts')
} finally {
  rmSync(staged, { recursive: true, force: true })
  rmSync(aggregate, { recursive: true, force: true })
}
