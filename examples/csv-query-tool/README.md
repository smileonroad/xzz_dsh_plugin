# csv-query-tool example

English | [中文](README.zh.md)

A model-facing tool plugin: `csv_query` parses a CSV document into JSON rows
with a hand-written parser (zero third-party dependencies), supporting quoted
fields, column selection, and row limits. It demonstrates two things beyond
the sql-check-tool example:

1. **Plugin configuration** — `export const Config: Schema<Config>`
   (Schemastery, same name as the interface), defaults on schema fields, and
   the second `apply(ctx, config)` argument. Configuration supplies the tool's
   safety bounds (`maxRows`) and fallbacks (`defaultDelimiter`); a per-call
   argument can override the configured default (config default < call
   argument).
2. **Bundle packaging** — the `bundle/` directory is a buildable, installable
   bundle (`dsh.bundle` manifest). Install it into a profile with
   `dsh plugin --profile web add`, and the profile boots it as a layer —
   no junction, no `--patch`, no absolute path.

## Running

This directory is the **source of truth** for the plugin. To run it, first
copy it into the deepseek-harness source's `examples/` (the copy over there may
be stale), then operate from the deepseek-harness root:

```sh
# 1. Copy into the deepseek-harness source (this repo is the source of truth)
rm -rf ../deepseek-harness/examples/csv-query-tool   # cp -r nests into an existing dir
cp -r examples/csv-query-tool ../deepseek-harness/examples/csv-query-tool

# 2a. Run the tests
cd ../deepseek-harness
pnpm exec vitest run examples/csv-query-tool/tests/csv-query-tool.spec.ts

# 2b. Or mount it into the web UI (temporary, via the patch layer)
pnpm dsh web --patch examples/csv-query-tool/csv-query.patch.yml
```

> Note: web HMR is disabled by default in release builds, so you must restart
> the web process after adding a plugin for the tool to appear.

In the web UI, paste a CSV and ask the model to parse it, e.g. *"Use csv_query
to parse this and give me the average age: name,age
xzz,30
alice,25"*.

## Configuration

The plugin accepts config through `cordis.yml` (Loader path), through
`ctx.plugin(plugin, config)` (test path), or through the bundle layer:

| Field | Type | Default | Behavior |
|---|---|---|---|
| `defaultDelimiter` | string | `','` | Delimiter used when the caller passes no `delimiter` argument |
| `maxRows` | number | `1000` | Hard cap on parsed rows; excess rows are dropped and `truncated: true` is set |

Layering: a per-call `delimiter` argument overrides `defaultDelimiter`; `limit`
only trims the returned rows so `totalRows` keeps the true parsed count.

The installed bundle layer pins `maxRows: 2` (see `bundle/cordis.patch.yml`)
so the web E2E can observe config reaching the tool: a 3-row CSV returns
`Parsed 2 columns, 2 rows (truncated)` and the model reports the truncation.
Note that pnpm installs a `file:` dependency as a **copy**, not a link — after
editing the bundle, `dsh plugin --profile web remove` + `add` again or the
profile keeps the stale copy and the config never appears.

## Design

- **Domain outcomes, not throws.** Malformed CSV and blank input return
  `{ ok: false, error: { type: 'parse' | 'empty', message, line? } }` — normal
  canonical values the model can branch on. Throws are reserved for
  infrastructure failures.
- **Honest cells.** Cells stay strings (CSV has no types); `totalRows` reports
  what was actually parsed and `truncated: true` tells the model the count may
  be incomplete.
- **Hand-written parser.** Quoted fields (embedded delimiter/newline/`""`
  escape), header on the first non-empty row, blank lines skipped, BOM
  stripped, row/column mismatch reported with the 1-based row number.
- **Pure presenters.** `presentCall` / `presentResult` derive card views from
  `args` and the persisted `presentationMeta` (replay-safe), same as
  sql-check-tool.

## How to develop

```
csv-query-tool/
├── src/index.ts                 # the plugin: name / inject / Config / apply
├── tests/csv-query-tool.spec.ts # 13 cases, real ToolRuntime + SystemPrompt
├── cordis.yml                   # test composition (system-prompt + tools + plugin)
├── csv-query.patch.yml          # web overlay entry (junction relative path)
└── bundle/                      # buildable bundle (package.json + built index.js + patch)
```

> Relationship note: this directory is the complete source + test package for
> the `csv_query` tool; `notes/2026-08-16-csv-query-tool.md` records the
> learning notes behind it (config mechanism + bundle distribution).

- `src/index.ts` — `name = 'csv-query-tool'`, `inject = ['tools']`,
  `export const Config: Schema<Config>` (Schemastery), registers `csv_query`
  via `defineTool`.
- `tests/csv-query-tool.spec.ts` — mounts the real `SystemPrompt` + `ToolRuntime`
  and executes through `ctx.tools.execute()`. Thirteen cases cover
  registration + Config schema, simple parsing, quoted fields, blank lines +
  BOM, column selection, limit + truncation, row/column mismatch, empty input,
  configured delimiter, per-call delimiter override, maxRows cap, automatic
  parameter validation, and presenter purity.

## How to ship (bundle)

The `bundle/` directory is the installable form. Build it, then install:

```sh
# 1. Build the JS bundle (esbuild; external keeps @deepseek-ai/dsh-tools a
#    runtime dependency resolved from the profile's node_modules)
cd examples/csv-query-tool
npx esbuild src/index.ts --bundle --format=esm --platform=node \
  --external:@deepseek-ai/dsh-tools --outfile=bundle/index.js

# 2. Install into a profile (from the deepseek-harness root)
cd ../..
pnpm dsh plugin --profile web add examples/csv-query-tool/bundle

# 3. Verify the layer, then boot
pnpm dsh --profile web --dump-config   # shows a "# == dsh-csv-query-tool" layer
pnpm dsh web
```

`dsh plugin add` pnpm-links the bundle into the profile and appends it to the
profile's `dsh.profile.bundles` list because the package declares
`dsh.bundle`. The bundle layer resolves the plugin by package name, so no
junction or absolute path is involved — this is the portable distribution path
that `--patch` (local, ephemeral) and junction relative paths (machine-local)
are not. Remove with `dsh plugin --profile web remove dsh-csv-query-tool`.

The full bundle contract and layer order are covered in the
[packaging tutorial](../../docs/user/develop/basic/publish.md).
