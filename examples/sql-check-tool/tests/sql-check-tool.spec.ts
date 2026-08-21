import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecutionResult, ToolResult } from '@deepseek-ai/dsh-tools'
import * as sqlCheckTool from '../src/index.ts'

const signal = new AbortController().signal

/**
 * Mount the real tool registry and system-prompt assembler, then the demo
 * plugin — the same seam a UI/model adapter exercises. Execute tools through
 * `ctx.tools.execute`, never by calling the handler directly.
 */
async function harness(): Promise<{ ctx: Context; tools: ToolRuntime }> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  await ctx.plugin(sqlCheckTool)
  return { ctx, tools: ctx.tools }
}

/** Dispatch `sql_check` through the registry pipeline, as the loop would. */
async function check(ctx: Context, sql: string): Promise<ToolExecutionResult> {
  return ctx.tools.execute({
    signal,
    callId: CallId('call-1'),
    name: 'sql_check',
    arguments: { sql },
  })
}

describe('sql-check-tool example plugin', () => {
  it('registers one global tool with Loader-safe exports and disposes it', async () => {
    const { ctx, tools } = await harness()
    expect(sqlCheckTool.name).toBe('sql-check-tool')
    expect(sqlCheckTool.inject).toEqual(['tools'])
    expect('default' in sqlCheckTool).toBe(false)

    // Schemas flow into system-prompt assembly automatically.
    const assembly = await ctx.systemPrompt.assemble()
    const schema = assembly.tools.find(tool => tool.name === 'sql_check')
    expect(schema?.description).toContain('SQLite')
    expect(schema?.parameters).toMatchObject({ properties: { sql: { type: 'string' } } })

    // Same-scope duplicate registration fails loud rather than shadowing.
    expect(() => tools.register(defineTool({
      name: 'sql_check',
      description: 'duplicate registration must throw',
      parameters: {},
      output: { schema: { type: 'null' }, render: () => [] },
      execute: async () => null,
    }))).toThrow(/tool "sql_check" is already registered/)
  })

  it('accepts valid SQL and multi-statement scripts', async () => {
    const { ctx } = await harness()
    const valid = await check(ctx, 'SELECT 1')
    expect(valid.isError).toBe(false)
    expect(valid.value).toEqual({ valid: true, errors: [] })

    const script = await check(ctx, 'CREATE TABLE t (id INTEGER); INSERT INTO t VALUES (1); SELECT * FROM t')
    expect(script.isError).toBe(false)
    expect(script.value).toEqual({ valid: true, errors: [] })
  })

  it('classifies a syntax error as a domain outcome, not a throw', async () => {
    const { ctx } = await harness()
    const result = await check(ctx, 'SELECT FROM WHERE')
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({
      valid: false,
      errors: [{ type: 'syntax', message: expect.stringContaining('syntax error') as string }],
    })
    expect(result.content[0]).toEqual({
      type: 'text',
      text: expect.stringContaining('[syntax]') as string,
    })
  })

  it('classifies a missing table as a semantic error', async () => {
    const { ctx } = await harness()
    const result = await check(ctx, 'SELECT * FROM missing_table')
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({
      valid: false,
      errors: [{ type: 'no-such-table', message: 'no such table: missing_table' }],
    })
  })

  it('reports blank input as an explicit empty error', async () => {
    const { ctx } = await harness()
    for (const sql of ['', '   ', '\n\t']) {
      const result = await check(ctx, sql)
      expect(result.isError).toBe(false)
      expect(result.value).toEqual({
        valid: false,
        errors: [{ type: 'empty', message: 'SQL is empty' }],
      })
    }
  })

  it('lets the model see a canonical object value, not prose', async () => {
    const { ctx } = await harness()
    const result = await check(ctx, 'SELECT 1')
    expect(result.value).toEqual({ valid: true, errors: [] })
    expect(result.content[0]).toEqual({ type: 'text', text: 'SQL is valid (SQLite dialect).' })
  })

  it('rejects missing required parameters through automatic validation', async () => {
    const { ctx } = await harness()
    const result = await ctx.tools.execute({
      signal,
      callId: CallId('call-2'),
      name: 'sql_check',
      arguments: {},
    })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('sql') as string })
  })

  it('keeps presenters pure: card views derive from args and persisted meta', async () => {
    const { tools } = await harness()
    const def = tools.get('sql_check')
    expect(def).toBeDefined()
    if (def === undefined) return

    // presentCall: pure function of args, no I/O.
    const call = def.presentCall?.({ sql: 'SELECT 1' })
    expect(call).toEqual({ card: 'generic', title: 'sql_check', rawInput: 'SELECT 1' })
    const long = def.presentCall?.({ sql: 'x'.repeat(100) })
    expect(long).toMatchObject({ card: 'generic', rawInput: `${'x'.repeat(80)}…` })

    // presentResult: derived from the persisted `meta`, replay-safe.
    const ok: ToolResult = {
      content: [],
      isError: false,
      meta: { valid: true, errorCount: 0 },
    }
    expect(def.presentResult?.({ sql: 'SELECT 1' }, ok)).toEqual({
      card: 'generic',
      title: 'sql_check: valid',
    })
    const bad: ToolResult = {
      content: [],
      isError: false,
      meta: { valid: false, errorCount: 2 },
    }
    expect(def.presentResult?.({ sql: 'SELECT FROM' }, bad)).toEqual({
      card: 'generic',
      title: 'sql_check: 2 error(s)',
    })

    // Presentation must never crash a replay: malformed meta falls back.
    expect(def.presentResult?.({ sql: 'SELECT 1' }, { content: [], isError: false })).toBeUndefined()
    expect(def.presentResult?.({ sql: 'SELECT 1' }, { content: [], isError: true, meta: {} })).toBeUndefined()
  })
})
