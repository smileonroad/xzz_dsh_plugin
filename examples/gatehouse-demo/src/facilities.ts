/**
 * The gated facilities behind the gatehouse door: three toy tools
 * (`use_locker`, `open_vault`, `use_lab`) plus the asker role — a
 * `tools/pre-execute` listener that asks the approval seam for these tools
 * instead of letting them run. This is the REAL harness ask path (dsh-tools'
 * `serviceAsk` turns `{ kind: 'ask' }` into `ctx.approval.request`), not a
 * hand-rolled asker. Every other tool passes through with `next()`.
 * @module gatehouse-facilities
 */

import { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-tools'

/** The ask reason is the visitor's story, shown to whoever answers. */
export const name = 'gatehouse-facilities'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.name === 'use_locker') {
      return { kind: 'ask', reason: 'a visitor wants to take something from a storage locker' }
    }
    if (exec.name === 'open_vault') {
      return { kind: 'ask', reason: 'a visitor wants to open the vault' }
    }
    if (exec.name === 'use_lab') {
      return { kind: 'ask', reason: 'a visitor wants to use the lab' }
    }
    return next()
  })

  ctx.tools.register(defineTool({
    name: 'use_locker',
    description: 'Take something from a storage locker in the gatehouse yard. ' +
      'The gatekeeper decides: regular visitors are waved through, strangers are checked.',
    parameters: {
      lockerId: { type: 'string', required: true, description: 'Locker number, e.g. A7' },
    },
    output: {
      schema: {
        type: 'object',
        properties: { opened: { type: 'string' } },
        additionalProperties: false,
      },
      render: () => [],
    },
    execute: async args => ({ opened: args.lockerId }),
  }))

  ctx.tools.register(defineTool({
    name: 'open_vault',
    description: 'Open the vault door. The gatekeeper refuses vault access outright.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: () => [],
    },
    execute: async () => 'vault opened',
  }))

  ctx.tools.register(defineTool({
    name: 'use_lab',
    description: 'Use the gatehouse lab for a purpose. ' +
      'Not on the keeper list, so somebody must be asked — the owner picks up, or nobody does.',
    parameters: {
      purpose: { type: 'string', required: true, description: 'What the lab is needed for' },
    },
    output: {
      schema: {
        type: 'object',
        properties: { granted: { type: 'string' } },
        additionalProperties: false,
      },
      render: () => [],
    },
    execute: async args => ({ granted: args.purpose }),
  }))
}
