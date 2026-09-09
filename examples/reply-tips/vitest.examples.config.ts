// Run this example's tests inside the deepseek-harness source tree.
//
// deepseek-harness retired its top-level examples/ workspace (commit
// 4125514a08), so its main vitest config no longer picks up examples/**.
// Copy this directory into <deepseek-harness>/examples/ first, then run from
// the deepseek-harness root:
//
//   pnpm exec vitest run --config examples/<name>/vitest.examples.config.ts examples/<name>
//
// The tsconfig paths map resolves every @deepseek-ai/* import to harness
// source, so the tests exercise the live harness tree, not a built lib.
// standardDecoratorPlugin comes from the harness root because harness source
// in every plugin's import chain uses standard decorators, which Vite's
// default esbuild transform mishandles.
import { fileURLToPath } from 'node:url'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin, vitestExecArgv } from '../../vitest.shared.ts'

export default defineConfig({
  plugins: [tsconfigPaths({ projects: [fileURLToPath(new URL('../../tsconfig.base.json', import.meta.url))] }), standardDecoratorPlugin()],
  test: {
    name: 'examples',
    execArgv: vitestExecArgv,
    pool: 'forks',
    include: ['examples/*/tests/**/*.spec.ts'],
  },
})
