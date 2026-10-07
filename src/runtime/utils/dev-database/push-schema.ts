import type { SQLWrapper } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

export type DevDialect = 'postgresql' | 'sqlite'

type PushSchema = (
  imports: Record<string, unknown>,
  db: unknown,
) => Promise<{
  sqlStatements: string[]
  hints: { hint: string }[]
  apply: () => Promise<void>
}>

/**
 * Indirection keeps the bundler from folding the specifier back to a literal
 * (rolldown constant-propagates ternaries/assignments, which would make it
 * resolve `drizzle-kit` at build time — see `loadPushSchema`).
 */
function importKitModule(specifier: string): Promise<unknown> {
  return import(/* @vite-ignore */ specifier)
}

async function loadPushSchema(dialect: DevDialect): Promise<PushSchema> {
  // The specifier must stay opaque to the bundler. A literal here makes
  // rolldown follow `drizzle-kit` into the server bundle graph: its
  // all-dialect entries reference every optional driver peer (@aws-sdk/*,
  // mysql2, @libsql/client, ...) through `__vite-optional-peer-dep` stubs,
  // and the build dies on their missing exports. drizzle-kit is only ever
  // imported at runtime, when the dev database is actually active.
  const specifier = dialect === 'postgresql'
    ? 'drizzle-kit/api-postgres'
    : 'drizzle-kit/payload/sqlite'
  const api = (await importKitModule(specifier)) as {
    pushSchema: PushSchema
  }
  return api.pushSchema
}

type MaybePromise<T> = T | Promise<T>

/**
 * drizzle-kit's sqlite push API talks to a low-level client
 * (query/run/batch) rather than a Drizzle instance, so the dev database is
 * adapted through the `all()`/`run()` every sqlite driver exposes.
 */
function toKitSqliteClient(db: unknown): unknown {
  const target = db as {
    all?: (query: SQLWrapper) => MaybePromise<unknown[]>
    run?: (query: SQLWrapper) => MaybePromise<unknown>
  }
  if (target.all === undefined || target.run === undefined) {
    throw new TypeError(
      'The dev database does not expose run()/all() for drizzle-kit push.',
    )
  }
  return {
    query: async (query: string): Promise<unknown[]> =>
      await target.all!.call(db, sql.raw(query)),
    run: async (query: string): Promise<void> => {
      await target.run!.call(db, sql.raw(query))
    },
    batch: async (statements: readonly string[]): Promise<void> => {
      for (const statement of statements) {
        await target.run!.call(db, sql.raw(statement))
      }
    },
  }
}

export interface DevSchemaPushReport {
  readonly statements: number
  readonly hints: readonly string[]
}

/**
 * Pushes the bundled Drizzle schema onto the dev database. Destructive
 * statements apply without confirmation — the dev database is disposable —
 * and their hints are surfaced as warnings.
 */
export async function pushDevSchema(context: {
  readonly dialect: DevDialect
  readonly db: unknown
  readonly schema: Record<string, unknown>
}): Promise<DevSchemaPushReport> {
  const pushSchema = await loadPushSchema(context.dialect)
  const client = context.dialect === 'postgresql'
    ? context.db
    : toKitSqliteClient(context.db)
  const { sqlStatements, hints, apply } = await pushSchema(
    context.schema,
    client,
  )
  for (const hint of hints) {
    console.warn(hint.hint)
  }
  await apply()
  return { statements: sqlStatements.length, hints: hints.map(h => h.hint) }
}
