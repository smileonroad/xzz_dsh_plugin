import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecutionResult, ToolResult } from '@deepseek-ai/dsh-tools'
import {
  UnitsService,
  UnitsError,
  convertWithTable,
  type UnitInfo,
} from '../units/src/index.ts'
import * as builtinProvider from '../units-builtin/src/index.ts'
import * as customProvider from '../units-custom/src/index.ts'
import * as toolUnits from '../tool-units/src/index.ts'

const signal = new AbortController().signal

/** Object-plugin shape shared by the two providers (name + apply). */
interface ProviderPlugin {
  name: string
  apply(ctx: Context, config?: unknown): unknown
}

/**
 * Mount the real tool registry + system-prompt assembler, ONE units provider,
 * and the consumer tool. The provider slot is the seam under test: swap the
 * provider argument and the same tool serves a different table.
 */
async function harness(provider: ProviderPlugin, config?: unknown): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  await ctx.plugin(provider as never, config as never)
  await ctx.plugin(toolUnits)
  return ctx
}

/** Dispatch `unit_convert` through the registry pipeline, as the loop would. */
async function convert(
  ctx: Context,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  return ctx.tools.execute({
    signal,
    callId: CallId('call-1'),
    name: 'unit_convert',
    arguments: args,
  })
}

/** A custom table exercising affine offsets (a fictional 'slurp' scale). */
const CUSTOM_TABLE: UnitInfo[] = [
  { name: 'smoot', system: 'length', factor: 1.7018, description: 'smoot (MIT tradition)' },
  { name: 'sm', system: 'length', factor: 1, description: 'synthetic meter' },
  { name: 'X', system: 'temperature', factor: 1, description: 'synthetic kelvin' },
  { name: 'Y', system: 'temperature', factor: 1, offset: 100, description: 'synthetic celsius' },
]

describe('units capability: three-role seam', () => {
  it('the Definition owns the contract and the pure conversion logic', () => {
    // Abstract service: cannot be constructed directly.
    expect(typeof UnitsService).toBe('function')
    expect(() => new (UnitsService as unknown as new () => unknown)()).toThrow()
    // Conversion math is provider-independent.
    expect(convertWithTable(5, 'km', 'm', builtinProvider.BUILTIN_TABLE)).toBeCloseTo(5000)
    expect(convertWithTable(0, 'C', 'F', builtinProvider.BUILTIN_TABLE)).toBeCloseTo(32)
    expect(convertWithTable(100, 'C', 'K', builtinProvider.BUILTIN_TABLE)).toBeCloseTo(373.15)
    // Domain errors are structured.
    expect(() => convertWithTable(1, 'nope', 'm', builtinProvider.BUILTIN_TABLE))
      .toThrowError(expect.objectContaining({ code: 'unknown-unit' }))
    expect(() => convertWithTable(1, 'm', 'kg', builtinProvider.BUILTIN_TABLE))
      .toThrowError(expect.objectContaining({ code: 'cross-system' }))
    expect(() => convertWithTable(1, 'm', 'kg', [])).toThrowError(UnitsError)
  })

  it('the built-in provider serves the service with its table', async () => {
    const ctx = await harness(builtinProvider)
    const result = await ctx.units.convert({ value: 1, from: 'GB', to: 'MB' })
    expect(result).toEqual({ value: 1024, from: 'GB', to: 'MB' })
    expect(ctx.units.list().some(unit => unit.name === 'lb')).toBe(true)
  })

  it('the custom provider serves the same seam with a config-supplied table', async () => {
    const ctx = await harness(customProvider, { table: CUSTOM_TABLE })
    const result = await ctx.units.convert({ value: 2, from: 'smoot', to: 'sm' })
    expect(result.value).toBeCloseTo(3.4036)
    // Affine offset honored by the shared math.
    const temp = await ctx.units.convert({ value: 0, from: 'Y', to: 'X' })
    expect(temp.value).toBeCloseTo(100)
  })

  it('the consumer tool works against the built-in provider', async () => {
    const ctx = await harness(builtinProvider)
    const result = await convert(ctx, { value: 5, from: 'km', to: 'mi' })
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({
      ok: true,
      value: expect.closeTo(3.106856, 5) as number,
      from: 'km',
      to: 'mi',
    })
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('5 km = 3.106856 mi') as string,
    })
  })

  it('the SAME tool serves the custom provider without any tool change', async () => {
    const ctx = await harness(customProvider, { table: CUSTOM_TABLE })
    const result = await convert(ctx, { value: 2, from: 'smoot', to: 'sm' })
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({ ok: true, value: expect.closeTo(3.4036, 5) as number })
  })

  it('turns unknown-unit service errors into canonical domain values', async () => {
    const ctx = await harness(builtinProvider)
    const result = await convert(ctx, { value: 1, from: 'parsec', to: 'm' })
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({
      ok: false,
      error: { type: 'unknown-unit', message: expect.stringContaining('parsec') as string },
    })
  })

  it('rejects missing required parameters through automatic validation', async () => {
    const ctx = await harness(builtinProvider)
    const result = await convert(ctx, { value: 1, from: 'm' })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('to') as string })
  })

  it('loading a second provider for the same service fails loud', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime, { mode: 'native' })
    await ctx.plugin(builtinProvider)
    await expect(ctx.plugin(customProvider, { table: CUSTOM_TABLE }))
      .rejects.toThrow(/service "units" has been registered/)
  })

  it('keeps presenters pure: card views derive from args and persisted meta', async () => {
    const ctx = await harness(builtinProvider)
    const def = ctx.tools.get('unit_convert')
    expect(def).toBeDefined()
    if (def === undefined) return

    const call = def.presentCall?.({ value: 5, from: 'km', to: 'mi' })
    expect(call).toEqual({ card: 'generic', title: 'unit_convert', rawInput: '5 km → mi' })

    const ok: ToolResult = {
      content: [],
      isError: false,
      meta: { ok: true, from: 'km', to: 'mi', value: 5 },
    }
    expect(def.presentResult?.({ value: 5, from: 'km', to: 'mi' }, ok)).toEqual({
      card: 'generic',
      title: 'unit_convert: 5 km → mi',
    })
    const bad: ToolResult = { content: [], isError: false, meta: { ok: false } }
    expect(def.presentResult?.({ value: 5, from: 'km', to: 'mi' }, bad)).toEqual({
      card: 'generic',
      title: 'unit_convert: error',
    })
    expect(def.presentResult?.({ value: 5, from: 'km', to: 'mi' }, { content: [], isError: true })).toBeUndefined()
  })

  it('registers one global tool per consumer with Loader-safe exports', async () => {
    const ctx = await harness(builtinProvider)
    expect(toolUnits.name).toBe('tool-units')
    expect(toolUnits.inject).toEqual(['tools', 'units'])
    expect('default' in toolUnits).toBe(false)
    expect(builtinProvider.name).toBe('units-builtin')
    expect(customProvider.name).toBe('units-custom')
    expect(customProvider.Config).toBeDefined()
    expect(() => ctx.tools.register(defineTool({
      name: 'unit_convert',
      description: 'duplicate registration must throw',
      parameters: {},
      output: { schema: { type: 'null' }, render: () => [] },
      execute: async () => null,
    }))).toThrow(/tool "unit_convert" is already registered/)
  })
})
