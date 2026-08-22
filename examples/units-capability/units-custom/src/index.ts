/**
 * Service Provider of `ctx.units`: the CUSTOM unit table, loaded from plugin
 * config. Same seam, different table — swapping this provider for
 * units-builtin in cordis.yml changes the capability's data without touching
 * the tool. The config schema mirrors `UnitInfo` from the Definition.
 * @module units-custom-provider
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import {
  UnitsService,
  convertWithTable,
  type ConvertRequest,
  type ConvertResult,
  type UnitInfo,
} from '../../units/src/index.ts'

export interface Config {
  /** Unit table supplied by the deployer; overrides nothing, replaces all. */
  table: UnitInfo[]
}

export const Config: Schema<Config> = Schema.object({
  table: Schema.array(Schema.object({
    name: Schema.string().required(),
    system: Schema.string().required(),
    factor: Schema.number().required(),
    offset: Schema.number(),
    description: Schema.string(),
  })).required(),
})

class CustomUnits extends UnitsService {
  constructor(ctx: Context, private readonly table: readonly UnitInfo[]) {
    super(ctx)
  }

  list(): UnitInfo[] {
    return [...this.table]
  }

  async convert(request: ConvertRequest): Promise<ConvertResult> {
    return {
      value: convertWithTable(request.value, request.from, request.to, this.table),
      from: request.from,
      to: request.to,
    }
  }
}

export const name = 'units-custom'

export async function apply(ctx: Context, config: Config) {
  // The nested plugin MUST be awaited: an unawaited fiber swallows
  // registration errors, so a duplicate provider would fail silently.
  await ctx.plugin(CustomUnits, config.table)
}
