/**
 * Service Provider of `ctx.units`: the built-in unit table (length, mass,
 * temperature, data). It carries no logic of its own — the conversion logic
 * lives in the Definition — so swapping this provider for another one (e.g.
 * units-custom) changes only the table, never the seam.
 * @module units-builtin-provider
 */

import type { Context } from '@deepseek-ai/cordis'
import {
  UnitsService,
  convertWithTable,
  type ConvertRequest,
  type ConvertResult,
  type UnitInfo,
} from '../../units/src/index.ts'

/** Built-in table; base units are m, kg, K, B with factor 1. */
export const BUILTIN_TABLE: readonly UnitInfo[] = [
  // length (base: meter)
  { name: 'm', system: 'length', factor: 1, description: 'meter' },
  { name: 'km', system: 'length', factor: 1000, description: 'kilometer' },
  { name: 'cm', system: 'length', factor: 0.01, description: 'centimeter' },
  { name: 'mm', system: 'length', factor: 0.001, description: 'millimeter' },
  { name: 'mi', system: 'length', factor: 1609.344, description: 'mile' },
  { name: 'ft', system: 'length', factor: 0.3048, description: 'foot' },
  { name: 'in', system: 'length', factor: 0.0254, description: 'inch' },
  // mass (base: kilogram)
  { name: 'kg', system: 'mass', factor: 1, description: 'kilogram' },
  { name: 'g', system: 'mass', factor: 0.001, description: 'gram' },
  { name: 'mg', system: 'mass', factor: 1e-6, description: 'milligram' },
  { name: 'lb', system: 'mass', factor: 0.45359237, description: 'pound' },
  // temperature (base: kelvin); affine offsets for C/F
  { name: 'K', system: 'temperature', factor: 1, description: 'kelvin' },
  { name: 'C', system: 'temperature', factor: 1, offset: 273.15, description: 'celsius' },
  { name: 'F', system: 'temperature', factor: 5 / 9, offset: 459.67, description: 'fahrenheit' },
  // data (base: byte); binary multiples
  { name: 'B', system: 'data', factor: 1, description: 'byte' },
  { name: 'KB', system: 'data', factor: 1024, description: 'kilobyte' },
  { name: 'MB', system: 'data', factor: 1024 ** 2, description: 'megabyte' },
  { name: 'GB', system: 'data', factor: 1024 ** 3, description: 'gigabyte' },
]

class BuiltinUnits extends UnitsService {
  list(): UnitInfo[] {
    return [...BUILTIN_TABLE]
  }

  async convert(request: ConvertRequest): Promise<ConvertResult> {
    return {
      value: convertWithTable(request.value, request.from, request.to, BUILTIN_TABLE),
      from: request.from,
      to: request.to,
    }
  }
}

export const name = 'units-builtin'

export async function apply(ctx: Context) {
  // The nested plugin MUST be awaited: an unawaited fiber swallows
  // registration errors, so a duplicate provider would fail silently.
  await ctx.plugin(BuiltinUnits)
}
