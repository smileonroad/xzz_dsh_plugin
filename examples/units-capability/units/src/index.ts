/**
 * Service Definition of the `ctx.units` capability seam: unit conversion.
 *
 * The Definition owns the contract — the service key, the Request/Result
 * types, and the pure conversion math. Providers only supply unit tables;
 * consumers (tools) only call the service. Neither depends on the other.
 * @module units-capability-definition
 */

import { Context, Service } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    units: UnitsService
  }
}

/** One unit in a table: affine conversion `base = (value + offset) * factor`. */
export interface UnitInfo {
  /** Unit symbol, e.g. `m`, `km`, `C`. */
  name: string
  /** Conversion family, e.g. `length`, `mass`, `temperature`, `data`. */
  system: string
  /** Linear factor relative to the system's base unit. */
  factor: number
  /** Affine offset (temperature); omitted = 0. */
  offset?: number
  /** Optional human-readable description. */
  description?: string
}

export interface ConvertRequest {
  value: number
  from: string
  to: string
}

export interface ConvertResult {
  value: number
  from: string
  to: string
}

/** Structured domain error thrown by the service layer. */
export class UnitsError extends Error {
  constructor(
    message: string,
    readonly code: 'unknown-unit' | 'cross-system' | 'empty-table',
  ) {
    super(message)
  }
}

/**
 * Pure conversion math shared by every provider: both units must exist in
 * the table and belong to the same system, else a {@link UnitsError} is
 * thrown. `base = (value + offset) * factor`, so a linear unit is just
 * `offset: 0`.
 */
export function convertWithTable(
  value: number,
  from: string,
  to: string,
  table: readonly UnitInfo[],
): number {
  if (table.length === 0) throw new UnitsError('unit table is empty', 'empty-table')
  const fromUnit = table.find(unit => unit.name === from)
  if (fromUnit === undefined) throw new UnitsError(`unknown unit: ${from}`, 'unknown-unit')
  const toUnit = table.find(unit => unit.name === to)
  if (toUnit === undefined) throw new UnitsError(`unknown unit: ${to}`, 'unknown-unit')
  if (fromUnit.system !== toUnit.system) {
    throw new UnitsError(
      `cannot convert between systems: ${from} is ${fromUnit.system}, ${to} is ${toUnit.system}`,
      'cross-system',
    )
  }
  const base = (value + (fromUnit.offset ?? 0)) * fromUnit.factor
  return base / toUnit.factor - (toUnit.offset ?? 0)
}

/**
 * Abstract unit-conversion service. A provider subclasses this, implements
 * the two abstract methods, and loads itself as a plugin — the Service
 * constructor registers it as `ctx.units` (one provider per context; loading
 * a second throws cordis' standard duplicate-service error).
 */
export abstract class UnitsService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'units')
  }

  /** All units this provider knows, for capability discovery. */
  abstract list(): UnitInfo[]

  /** Convert one value; throws {@link UnitsError} for unsupported units. */
  abstract convert(request: ConvertRequest): Promise<ConvertResult>
}
