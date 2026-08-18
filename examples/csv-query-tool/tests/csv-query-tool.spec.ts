import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecutionResult, ToolResult } from '@deepseek-ai/dsh-tools'
import * as csvQueryTool from '../src/index.ts'

const signal = new AbortController().signal

/** Mount the real tool registry + system-prompt assembler, then the plugin. */
async function harness(config: csvQueryTool.Config = {}): Promise<{ ctx: Context; tools: ToolRuntime }> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  await ctx.plugin(csvQueryTool, config)
  return { ctx, tools: ctx.tools }
}

/** Dispatch `csv_query` through the registry pipeline, as the loop would. */
async function query(
  ctx: Context,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  return ctx.tools.execute({
    signal,
    callId: CallId('call-1'),
    name: 'csv_query',
    arguments: args,
  })
}

const SIMPLE = 'name,age\nxzz,30\nalice,25'

describe('csv-query-tool example plugin', () => {
  it('registers one global tool with Loader-safe exports and a Config schema', async () => {
    const { ctx, tools } = await harness()
    expect(csvQueryTool.name).toBe('csv-query-tool')
    expect(csvQueryTool.inject).toEqual(['tools'])
    expect('default' in csvQueryTool).toBe(false)

    // Config defaults live on the schema; an omitted config still works.
    expect(csvQueryTool.Config.toString()).toContain('defaultDelimiter')

    const assembly = await ctx.systemPrompt.assemble()
    expect(assembly.tools.some(tool => tool.name === 'csv_query')).toBe(true)

    expect(() => tools.register(defineTool({
      name: 'csv_query',
      description: 'duplicate registration must throw',
      parameters: {},
      output: { schema: { type: 'null' }, render: () => [] },
      execute: () => null,
    }))).toThrow(/tool "csv_query" is already registered/)
  })

  it('parses a simple CSV into string cells with a header row', async () => {
    const { ctx } = await harness()
    const result = await query(ctx, { csv: SIMPLE })
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({
      ok: true,
      columns: ['name', 'age'],
      rows: [
        { name: 'xzz', age: '30' },
        { name: 'alice', age: '25' },
      ],
      totalRows: 2,
      truncated: false,
    })
  })

  it('handles quoted fields with embedded delimiters, newlines, and escaped quotes', async () => {
    const { ctx } = await harness()
    const csv = 'id,note\na,"hello, world"\nb,"line1\nline2"\nc,"say ""hi"""'
    const result = await query(ctx, { csv })
    expect(result.isError).toBe(false)
    const value = result.value as { rows: Record<string, string>[] }
    expect(value.rows).toEqual([
      { id: 'a', note: 'hello, world' },
      { id: 'b', note: 'line1\nline2' },
      { id: 'c', note: 'say "hi"' },
    ])
  })

  it('skips blank lines and strips a leading BOM', async () => {
    const { ctx } = await harness()
    const result = await query(ctx, { csv: '\uFEFFa,b\n\n1,2\n\n3,4' })
    expect(result.value).toEqual({
      ok: true,
      columns: ['a', 'b'],
      rows: [
        { a: '1', b: '2' },
        { a: '3', b: '4' },
      ],
      totalRows: 2,
      truncated: false,
    })
  })

  it('selects columns, ignoring unknown names', async () => {
    const { ctx } = await harness()
    const result = await query(ctx, { csv: SIMPLE, select: ['age', 'missing'] })
    expect(result.value).toEqual({
      ok: true,
      columns: ['age'],
      rows: [{ age: '30' }, { age: '25' }],
      totalRows: 2,
      truncated: false,
    })
  })

  it('limits rows and reports the true parsed total with truncated', async () => {
    const { ctx } = await harness()
    const result = await query(ctx, { csv: SIMPLE, limit: 1 })
    expect(result.value).toEqual({
      ok: true,
      columns: ['name', 'age'],
      rows: [{ name: 'xzz', age: '30' }],
      totalRows: 2,
      truncated: true,
    })
  })

  it('reports a row/column mismatch as a parse domain error with the row number', async () => {
    const { ctx } = await harness()
    const result = await query(ctx, { csv: 'a,b\n1,2,3' })
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({
      ok: false,
      error: {
        type: 'parse',
        message: expect.stringContaining('has 3 cells, header has 2') as string,
        line: 2,
      },
    })
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('[parse]') as string,
    })
  })

  it('reports blank input as an explicit empty error', async () => {
    const { ctx } = await harness()
    const result = await query(ctx, { csv: '   ' })
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({ ok: false, error: { type: 'empty', message: 'CSV is empty' } })
  })

  it('uses the configured default delimiter when the caller passes none', async () => {
    const { ctx } = await harness({ defaultDelimiter: ';' })
    const result = await query(ctx, { csv: 'a;b\n1;2' })
    expect(result.value).toMatchObject({ columns: ['a', 'b'], rows: [{ a: '1', b: '2' }] })
  })

  it('lets the per-call delimiter override the configured default', async () => {
    const { ctx } = await harness({ defaultDelimiter: ';' })
    const result = await query(ctx, { csv: 'a,b\n1,2', delimiter: ',' })
    expect(result.value).toMatchObject({ columns: ['a', 'b'], rows: [{ a: '1', b: '2' }] })
  })

  it('caps rows at the configured maxRows, marking truncated', async () => {
    const { ctx } = await harness({ maxRows: 2 })
    const result = await query(ctx, { csv: 'a\n1\n2\n3\n4' })
    expect(result.value).toEqual({
      ok: true,
      columns: ['a'],
      rows: [{ a: '1' }, { a: '2' }],
      totalRows: 2,
      truncated: true,
    })
  })

  it('rejects missing required parameters through automatic validation', async () => {
    const { ctx } = await harness()
    const result = await query(ctx, {})
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('csv') as string })
  })

  it('keeps presenters pure: card views derive from args and persisted meta', async () => {
    const { tools } = await harness()
    const def = tools.get('csv_query')
    expect(def).toBeDefined()
    if (def === undefined) return

    const call = def.presentCall?.({ csv: 'a,b\n1,2' })
    expect(call).toEqual({ card: 'generic', title: 'csv_query', rawInput: 'a,b\n1,2' })

    const ok: ToolResult = { content: [], isError: false, meta: { ok: true, rowCount: 12, truncated: true } }
    expect(def.presentResult?.({ csv: 'a' }, ok)).toEqual({
      card: 'generic',
      title: 'csv_query: 12 rows (truncated)',
    })
    const bad: ToolResult = { content: [], isError: false, meta: { ok: false, rowCount: 0 } }
    expect(def.presentResult?.({ csv: 'a' }, bad)).toEqual({ card: 'generic', title: 'csv_query: error' })
    expect(def.presentResult?.({ csv: 'a' }, { content: [], isError: false })).toBeUndefined()
    expect(def.presentResult?.({ csv: 'a' }, { content: [], isError: true, meta: {} })).toBeUndefined()
  })
})
