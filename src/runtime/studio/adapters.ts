import type { DrizzleLocalDriver } from '../../types'
import { Buffer } from 'node:buffer'

/**
 * A single query as sent by the Studio frontend (`type: "proxy"` / `"tproxy"`
 * message data). `method` mirrors drizzle's query modes; `mode` selects the
 * row shape the frontend expects back.
 */
export interface StudioQuery {
  readonly sql: string
  readonly params?: readonly unknown[]
  readonly mode?: 'array' | 'object'
  readonly method?: 'values' | 'get' | 'all' | 'run' | 'execute'
}

/**
 * Executes Studio queries against the dev database client. Implementations
 * share the client instance the app itself runs on, so in-memory databases
 * observe the same data as the running server.
 */
export interface StudioExecutor {
  query: (data: StudioQuery) => Promise<unknown>
  transaction: (queries: ReadonlyArray<{ readonly sql: string, readonly method?: StudioQuery['method'] }>) => Promise<unknown[]>
}

interface SqliteSyncStatement {
  all: (...params: unknown[]) => unknown[]
  get: (...params: unknown[]) => unknown
  run: (...params: unknown[]) => unknown
}

interface SqliteSyncDatabase {
  prepare: (sql: string) => SqliteSyncStatement
  exec: (sql: string) => unknown
}

/** `better-sqlite3` and `bun:sqlite` wrap a unit of work atomically. */
interface SqliteTransactionHelper {
  transaction: (fn: () => void) => () => void
}

interface LibsqlClient {
  execute: (statement: { sql: string, args?: unknown[] }) => Promise<{ rows: unknown[] }>
  batch: (statements: Array<{ sql: string, args?: unknown[] }>) => Promise<Array<{ rows?: unknown[] }>>
}

interface PgliteQueryOptions {
  rowMode?: 'array' | 'object'
  parsers?: Record<string, (value: unknown) => unknown>
}

interface PgliteClient {
  query: (sql: string, params?: unknown[], options?: PgliteQueryOptions) => Promise<{ rows: unknown[] }>
  transaction: <T>(fn: (tx: PgliteClient) => Promise<T>) => Promise<T>
}

/**
 * Studio sends binary values as `{ type: 'binary', value }`. The sqlite
 * family and libsql want Buffers; pglite takes the raw value.
 */
function binaryToBuffer(params: readonly unknown[]): unknown[] {
  return params.map((param) => {
    if (!isBinaryParam(param)) {
      return param
    }
    const value = typeof param.value === 'object' && param.value !== null
      ? JSON.stringify(param.value)
      : String(param.value)
    return Buffer.from(value)
  })
}

function binaryToRaw(params: readonly unknown[]): unknown[] {
  return params.map((param) => {
    if (!isBinaryParam(param)) {
      return param
    }
    return typeof param.value === 'object' ? JSON.stringify(param.value) : param.value
  })
}

function isBinaryParam(value: unknown): value is { type: 'binary', value: unknown } {
  return typeof value === 'object' && value !== null
    && (value as { type?: unknown }).type === 'binary'
    && 'value' in value
}

function isReadMethod(method: StudioQuery['method']): boolean {
  return method === 'values' || method === 'get' || method === 'all'
}

/**
 * better-sqlite3 / node:sqlite / bun:sqlite share one synchronous shape.
 * They differ in raw-row support and transaction helpers, hence the engine
 * parameter.
 */
export function sqliteSyncExecutor(
  db: SqliteSyncDatabase,
  engine: 'better-sqlite3' | 'node-sqlite' | 'bun-sqlite',
): StudioExecutor {
  // Read statements and side-effect statements need different call shapes
  // per engine (better-sqlite3's raw() rejects statements without results),
  // so every execution path dispatches on the query method.
  const runStatement = (
    sql: string,
    params: readonly unknown[],
    mode: StudioQuery['mode'],
    method: StudioQuery['method'],
  ): unknown => {
    const statement = db.prepare(sql)
    if (!isReadMethod(method)) {
      statement.run(...params)
      return []
    }
    if (engine === 'better-sqlite3') {
      // raw() switches .all() to arrays of arrays for mode "array".
      return (statement as SqliteSyncStatement & { raw: (enabled: boolean) => SqliteSyncStatement })
        .raw(mode === 'array')
        .all(...params)
    }
    if (engine === 'bun-sqlite') {
      return (statement as SqliteSyncStatement & { values: (...params: unknown[]) => unknown[][] })
        .values(...params)
    }
    const rows = statement.all(...params)
    return mode === 'array'
      ? (rows as Record<PropertyKey, unknown>[]).map(row => Object.values(row))
      : rows
  }

  const runInTransaction = (queries: readonly { sql: string, method?: StudioQuery['method'] }[]): unknown[] => {
    const results: unknown[] = []
    const runAll = (): void => {
      for (const query of queries) {
        results.push(runStatement(query.sql, [], 'object', query.method))
      }
    }
    if (engine === 'node-sqlite') {
      // node:sqlite has no transaction helper; drive the statements manually.
      db.exec('BEGIN')
      try {
        runAll()
        db.exec('COMMIT')
      }
      catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return results
    }
    ;(db as SqliteSyncDatabase & SqliteTransactionHelper).transaction(runAll)()
    return results
  }

  return {
    async query(data) {
      return runStatement(data.sql, binaryToBuffer(data.params ?? []), data.mode, data.method)
    },
    async transaction(queries) {
      const results: unknown[] = []
      try {
        results.push(...runInTransaction(queries))
      }
      catch (error) {
        results.push(error)
      }
      return results
    },
  }
}

export function libsqlExecutor(client: LibsqlClient): StudioExecutor {
  return {
    async query(data) {
      const result = await client.execute({
        sql: data.sql,
        args: binaryToBuffer(data.params ?? []),
      })
      if (data.mode === 'array') {
        return (result.rows as Record<PropertyKey, unknown>[]).map(row => Object.values(row))
      }
      return result.rows
    },
    async transaction(queries) {
      const results: unknown[] = []
      try {
        // libsql executes batches atomically.
        const batch = await client.batch(queries.map(query => ({ sql: query.sql, args: [] })))
        for (const item of batch) {
          results.push(item.rows ?? [])
        }
      }
      catch (error) {
        results.push(error)
      }
      return results
    },
  }
}

/**
 * drizzle-kit keeps date/time columns as raw strings so Studio renders the
 * database's own representation instead of a re-serialized Date.
 */
const PG_TIMESTAMP_OIDS = ['1082', '1083', '1114', '1184'] as const

export function pgliteExecutor(client: PgliteClient): StudioExecutor {
  const parsers: Record<string, (value: unknown) => unknown> = {}
  for (const oid of PG_TIMESTAMP_OIDS) {
    parsers[oid] = value => value
  }

  return {
    async query(data) {
      const result = await client.query(data.sql, binaryToRaw(data.params ?? []), {
        rowMode: data.mode === 'array' ? 'array' : 'object',
        parsers,
      })
      return result.rows
    },
    async transaction(queries) {
      const results: unknown[] = []
      try {
        await client.transaction(async (tx) => {
          for (const query of queries) {
            const result = await tx.query(query.sql, undefined, { parsers })
            results.push(result.rows)
          }
        })
      }
      catch (error) {
        results.push(error)
      }
      return results
    },
  }
}

/**
 * Builds the executor for the engine the dev database actually runs on. The
 * db instance comes from `useDrizzle()`; `$client` exposes its underlying
 * driver client so in-memory databases stay shared with the app.
 */
export function createStudioExecutor(
  engine: DrizzleLocalDriver,
  db: unknown,
): StudioExecutor {
  const client = (db as { readonly $client?: unknown }).$client
  if (client === undefined) {
    throw new Error(`The ${engine} dev client does not expose $client.`)
  }
  switch (engine) {
    case 'better-sqlite3':
    case 'node-sqlite':
    case 'bun-sqlite':
      return sqliteSyncExecutor(client as SqliteSyncDatabase, engine)
    case 'libsql':
      return libsqlExecutor(client as LibsqlClient)
    case 'pglite':
      return pgliteExecutor(client as PgliteClient)
    default:
      throw new Error(`Unsupported studio engine: ${String(engine)}`)
  }
}
