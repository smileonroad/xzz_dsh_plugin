/**
 * SQL syntax-checking tool demo plugin (`sql_check`).
 *
 * Learning focus (contrast with the helloworld-command example):
 *  - a TOOL is called by the model through `ctx.tools`, needs a model turn,
 *    and returns a canonical JSON value rather than UI text;
 *  - a domain outcome that is "bad" (invalid SQL) is still a SUCCESSFUL
 *    canonical value (`{ valid: false, errors: [...] }`), never a throw —
 *    throws are reserved for infrastructure failures (cookbook rule);
 *  - zero third-party dependencies: the checker is the real SQLite parser via
 *    Node's built-in `node:sqlite` (same choice as @deepseek-ai/dsh-session-query-sqlite).
 * @module sql-check-tool
 */

import { DatabaseSync } from 'node:sqlite'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'sql-check-tool'
export const inject = ['tools']

/** Structured, model-facing classification of one SQLite error message. */
export type SqlCheckErrorType = 'syntax' | 'no-such-table' | 'empty' | 'other'

export interface SqlCheckError {
  type: SqlCheckErrorType
  message: string
}

/** Canonical outcome of one check. Invalid SQL is a successful domain value. */
export interface SqlCheckResult {
  valid: boolean
  errors: SqlCheckError[]
}

/** Map a raw SQLite error message onto the structured classification. */
function classifyError(message: string): SqlCheckErrorType {
  if (message.includes('syntax error')) return 'syntax'
  if (message.startsWith('no such table:')) return 'no-such-table'
  return 'other'
}

/** Extract a human-readable message from an unknown thrown value. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'sql_check',
    description: 'Validate SQL syntax and semantics against the SQLite parser. ' +
      'Returns { valid, errors } where errors classify failures as syntax, ' +
      'no-such-table, or empty. Does not persist anything.',
    parameters: {
      sql: {
        type: 'string',
        required: true,
        description: 'The SQL statement(s) to check (SQLite dialect, multiple statements allowed)',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          valid: { type: 'boolean' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                message: { type: 'string' },
              },
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
      // Model-facing projection of the canonical value.
      render: (_args, value) => [{
        type: 'text',
        text: value.valid
          ? 'SQL is valid (SQLite dialect).'
          : value.errors.map(e => `- [${e.type}] ${e.message}`).join('\n'),
      }],
      // Replayable card data: persisted on `tool/result`, handed to
      // `presentResult` on live streaming AND on session-log replay.
      presentationMeta: (_args, value) => ({
        valid: value.valid,
        errorCount: value.errors.length,
      }),
    },
    // Pending-state card. Pure function of `args` — no I/O, no session state.
    presentCall: args => ({
      card: 'generic',
      title: 'sql_check',
      rawInput: args.sql.length > 80 ? `${args.sql.slice(0, 80)}…` : args.sql,
    }),
    // Completed card: title is derived from the persisted meta, never from
    // re-parsing anything (replay-safe).
    presentResult: (_args, result) => {
      if (result.isError) return undefined
      const meta = result.meta as { valid?: boolean; errorCount?: number } | undefined
      if (meta === undefined) return undefined
      return {
        card: 'generic',
        title: meta.valid === true
          ? 'sql_check: valid'
          : `sql_check: ${meta.errorCount ?? 0} error(s)`,
      }
    },
    async execute(args, exec) {
      // A pre-aborted invocation is already rejected by the registry; this
      // check is the in-body half of the cancellation contract.
      if (exec.signal.aborted) throw new DOMException('aborted', 'AbortError')

      const sql = args.sql.trim()
      if (sql === '') {
        // SQLite itself accepts blank input; the tool deliberately reports it
        // as an invalid domain outcome because a blank string is almost always
        // a caller mistake the model should notice.
        return { valid: false, errors: [{ type: 'empty', message: 'SQL is empty' }] }
      }

      // A fresh in-memory database per call: authoritative SQLite parsing with
      // no persistence and no cross-call state.
      const db = new DatabaseSync(':memory:')
      try {
        db.exec(sql)
        return { valid: true, errors: [] }
      } catch (error) {
        // Only SQLite's own errors are a domain outcome. Anything else
        // (e.g. node:sqlite being unavailable) must propagate as a failure.
        if (String((error as { code?: unknown }).code) === 'ERR_SQLITE_ERROR') {
          const message = messageOf(error)
          return { valid: false, errors: [{ type: classifyError(message), message }] }
        }
        throw error
      } finally {
        db.close()
      }
    },
  }))
}
