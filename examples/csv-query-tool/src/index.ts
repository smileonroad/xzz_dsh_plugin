/**
 * CSV parsing/querying tool demo plugin (`csv_query`).
 *
 * Third practice example. Learning focus beyond sql-check-tool:
 *  - PLUGIN CONFIG: `export const Config: Schema<Config>` (Schemastery, same
 *    name as the interface) injects validated config as the second `apply`
 *    argument; defaults live on the schema fields. Config supplies the tool's
 *    safety bounds and fallbacks, and a per-call parameter can override the
 *    configured default (layered: config default < call argument).
 *  - A CSV parser written by hand (zero third-party dependencies): quoted
 *    fields with embedded delimiters/newlines, `""` escapes, header row,
 *    BOM stripping, row/column mismatch detection with line numbers.
 * @module csv-query-tool
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'csv-query-tool'
export const inject = ['tools']

/** Plugin configuration; defaults live on the schema fields below. */
export interface Config {
  /** Delimiter used when the caller does not pass `delimiter`. */
  defaultDelimiter: string
  /** Hard cap on parsed rows (safety bound; excess rows are dropped and `truncated` is set). */
  maxRows: number
}

export const Config: Schema<Config> = Schema.object({
  defaultDelimiter: Schema.string().default(','),
  maxRows: Schema.number().default(1000),
})

/** Structured, model-facing classification of one CSV failure. */
export type CsvQueryErrorType = 'empty' | 'parse'

export interface CsvQueryError {
  type: CsvQueryErrorType
  message: string
  /** 1-based row number for parse errors, when known. */
  line?: number
}

/** Canonical outcome of one query. Bad input is a successful domain value. */
export interface CsvQueryResult {
  ok: boolean
  /** Header columns of the parsed table. */
  columns?: string[]
  /** Data rows as column→cell maps; cells stay strings (CSV has no types). */
  rows?: Record<string, string>[]
  /** Number of rows actually parsed (incomplete when `truncated` is true). */
  totalRows?: number
  /** Whether a safety/limit cap dropped rows before they were returned. */
  truncated?: boolean
  error?: CsvQueryError
}

/** Parse failure with the 1-based row where it happened. */
class CsvParseError extends Error {
  constructor(message: string, readonly line: number) {
    super(message)
  }
}

/**
 * Hand-written CSV parser: quoted fields (embedded delimiter, newline, `""`
 * escape), header on the first non-empty row, blank lines skipped, leading
 * BOM stripped. Stops after `maxRows` data rows (header does not count).
 * @throws CsvParseError on a row whose cell count differs from the header.
 */
export function parseCsv(
  text: string,
  delimiter: string,
  maxRows: number,
): { columns: string[]; rows: string[][]; hitMax: boolean } {
  const columns: string[] = []
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let hitMax = false
  let line = 1

  const pushField = (): void => {
    row.push(field)
    field = ''
  }
  const pushRow = (): void => {
    if (row.length === 0) return
    // A single empty field is a blank line (`,,` still counts as a row).
    if (row.length === 1 && row[0] === '') {
      row = []
      return
    }
    if (columns.length === 0) {
      columns.push(...row)
    } else if (row.length !== columns.length) {
      throw new CsvParseError(
        `row ${line} has ${row.length} cells, header has ${columns.length}`,
        line,
      )
    } else if (rows.length < maxRows) {
      rows.push(row)
    } else {
      hitMax = true
    }
    row = []
  }

  // Strip a leading BOM before parsing.
  const source = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text

  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (inQuotes) {
      if (char === '"') {
        // `""` inside a quoted field is an escaped quote; a single `"` closes.
        if (source[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
        if (char === '\n') line++
      }
      continue
    }
    if (char === '"' && field === '') {
      inQuotes = true
    } else if (char === delimiter) {
      pushField()
    } else if (char === '\n') {
      pushField()
      pushRow()
      line++
    } else if (char !== '\r') {
      field += char
    }
  }
  pushField()
  pushRow()
  return { columns, rows, hitMax }
}

export function apply(ctx: Context, config: Config) {
  ctx.tools.register(defineTool({
    name: 'csv_query',
    description: 'Parse a CSV document into JSON rows, optionally selecting ' +
      'columns and limiting rows. Returns { ok, columns, rows, totalRows, truncated } ' +
      'or { ok: false, error } for empty or malformed input.',
    parameters: {
      csv: {
        type: 'string',
        required: true,
        description: 'The CSV text to parse (header row required)',
      },
      delimiter: {
        type: 'string',
        description: `Field delimiter (default: configured '${config.defaultDelimiter}')`,
      },
      select: {
        type: 'array',
        items: { type: 'string' },
        description: 'Columns to keep in each row; unknown names are ignored',
      },
      limit: {
        type: 'number',
        description: 'Max rows to return (never exceeds the configured maxRows)',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          columns: { type: 'array', items: { type: 'string' } },
          rows: { type: 'array', items: { type: 'json' } },
          totalRows: { type: 'number' },
          truncated: { type: 'boolean' },
          error: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              message: { type: 'string' },
              line: { type: 'number' },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
      // Model-facing projection of the canonical value.
      render: (_args, value) => {
        if (value.ok !== true) {
          const error = value.error ?? { type: 'empty' as const, message: 'unknown error' }
          return [{
            type: 'text',
            text: `CSV query failed: [${error.type}] ${error.message}${error.line === undefined ? '' : ` (row ${error.line})`}`,
          }]
        }
        return [{
          type: 'text',
          text: `Parsed ${value.columns?.length ?? 0} columns, ${value.rows?.length ?? 0} rows` +
            (value.truncated === true ? ' (truncated)' : ''),
        }]
      },
      // Replayable card data: persisted on `tool/result`, handed to
      // `presentResult` on live streaming AND on session-log replay.
      presentationMeta: (_args, value) => ({
        ok: value.ok === true,
        rowCount: value.rows?.length ?? 0,
        truncated: value.truncated === true,
      }),
    },
    // Pending-state card. Pure function of `args` — no I/O, no session state.
    presentCall: args => ({
      card: 'generic',
      title: 'csv_query',
      rawInput: args.csv.length > 80 ? `${args.csv.slice(0, 80)}…` : args.csv,
    }),
    // Completed card: title derived from the persisted meta, replay-safe.
    presentResult: (_args, result) => {
      if (result.isError) return undefined
      const meta = result.meta as { ok?: boolean; rowCount?: number; truncated?: boolean } | undefined
      if (meta === undefined) return undefined
      if (meta.ok !== true) return { card: 'generic', title: 'csv_query: error' }
      return {
        card: 'generic',
        title: `csv_query: ${meta.rowCount ?? 0} rows${meta.truncated === true ? ' (truncated)' : ''}`,
      }
    },
    async execute(args, exec) {
      if (exec.signal.aborted) throw new DOMException('aborted', 'AbortError')

      const csv = args.csv.trim()
      if (csv === '') {
        return { ok: false, error: { type: 'empty', message: 'CSV is empty' } }
      }

      // Layered configuration: per-call argument overrides the configured default.
      const delimiter = args.delimiter ?? config.defaultDelimiter

      let parsed: ReturnType<typeof parseCsv>
      try {
        // The parser cap is the configured safety bound; `limit` only trims the
        // returned rows so `totalRows` keeps the true parsed count.
        parsed = parseCsv(csv, delimiter, config.maxRows)
      } catch (error) {
        if (error instanceof CsvParseError) {
          return { ok: false, error: { type: 'parse', message: error.message, line: error.line } }
        }
        throw error
      }

      const selectedIndexes = args.select === undefined
        ? parsed.columns.map((_, index) => index)
        : parsed.columns
          .map((name, index) => args.select!.includes(name) ? index : -1)
          .filter(index => index >= 0)
      const columns = selectedIndexes.map(index => parsed.columns[index])
      const limited = args.limit === undefined
        ? parsed.rows
        : parsed.rows.slice(0, args.limit)
      const rows = limited.map(row => {
        const out: Record<string, string> = {}
        for (const index of selectedIndexes) {
          out[parsed.columns[index]] = row[index] ?? ''
        }
        return out
      })

      return {
        ok: true,
        columns,
        rows,
        totalRows: parsed.rows.length,
        truncated: parsed.hitMax || limited.length < parsed.rows.length,
      }
    },
  }))
}
