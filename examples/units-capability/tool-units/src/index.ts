/**
 * Model-facing Consumer of the `ctx.units` capability seam: the `unit_convert`
 * tool. It injects the service key like any other service and delegates to
 * it — the tool knows nothing about which provider (built-in or custom table)
 * is mounted. Domain errors from the service (`UnitsError`) become canonical
 * `{ ok: false, error }` values, never throws.
 * @module tool-units-consumer
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { UnitsError } from '../../units/src/index.ts'

export const name = 'tool-units'
export const inject = ['tools', 'units']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'unit_convert',
    description: 'Convert a value between units of the same system ' +
      '(length, mass, temperature, data). Returns { ok, value, from, to } or ' +
      '{ ok: false, error } for unknown units or cross-system requests.',
    parameters: {
      value: { type: 'number', required: true, description: 'Numeric value to convert' },
      from: { type: 'string', required: true, description: 'Source unit symbol, e.g. km' },
      to: { type: 'string', required: true, description: 'Target unit symbol, e.g. mi' },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          value: { type: 'number' },
          from: { type: 'string' },
          to: { type: 'string' },
          error: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              message: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
      render: (args, value) => [{
        type: 'text',
        text: value.ok === true
          ? `${args.value} ${value.from} = ${typeof value.value === 'number' ? round(value.value) : ''} ${value.to}`
          : `unit conversion failed: [${value.error?.type}] ${value.error?.message}`,
      }],
      presentationMeta: (_args, value) => ({
        ok: value.ok === true,
        from: value.from ?? '',
        to: value.to ?? '',
        value: typeof value.value === 'number' ? value.value : 0,
      }),
    },
    presentCall: args => ({
      card: 'generic',
      title: 'unit_convert',
      rawInput: `${args.value} ${args.from} → ${args.to}`,
    }),
    presentResult: (_args, result) => {
      if (result.isError) return undefined
      const meta = result.meta as { ok?: boolean; from?: string; to?: string; value?: number } | undefined
      if (meta === undefined) return undefined
      if (meta.ok !== true) return { card: 'generic', title: 'unit_convert: error' }
      return { card: 'generic', title: `unit_convert: ${meta.value} ${meta.from} → ${meta.to}` }
    },
    async execute(args, exec) {
      if (exec.signal.aborted) throw new DOMException('aborted', 'AbortError')
      try {
        const result = await ctx.units.convert({ value: args.value, from: args.from, to: args.to })
        return { ok: true, value: result.value, from: result.from, to: result.to }
      } catch (error) {
        if (error instanceof UnitsError) {
          return { ok: false, error: { type: error.code, message: error.message } }
        }
        throw error
      }
    },
  }))
}

/** Keep rendered values readable: 6 significant decimals at most. */
function round(value: number): number {
  return Number(value.toFixed(6))
}
