#!/usr/bin/env node
/**
 * Self-contained build for @smileonroad/dsh-grill-send-button.
 *
 * The sources are TypeScript, so this shells out to esbuild to emit ESM into
 * lib/. The installed package ships the prebuilt lib/, so consumers never need
 * a build step. Developers regenerate lib/ with `npm run build` (or the
 * devDependency esbuild resolves locally, or ESBUILD_BIN points at one).
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function esbuildPath() {
  if (process.env.ESBUILD_BIN) return process.env.ESBUILD_BIN
  const local = join(root, 'node_modules', 'esbuild', 'bin', 'esbuild')
  if (existsSync(local)) return local
  return 'esbuild' // assume on PATH
}

function build(entry, outfile) {
  execFileSync(process.execPath, [
    esbuildPath(), entry,
    `--outfile=${outfile}`, '--format=esm', '--target=es2022',
  ], { cwd: root, stdio: 'inherit' })
}

build(join(root, 'src', 'index.ts'), join(root, 'lib', 'client.js'))
build(join(root, 'src', 'host.ts'), join(root, 'lib', 'index.js'))
console.log('built lib/client.js and lib/index.js')
