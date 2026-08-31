import type { SQLWrapper } from 'drizzle-orm'
import { consola } from 'consola'
import { sql } from 'drizzle-orm'

export type DevDialect = 'postgresql' | 'sqlite'

const logger = consola.withTag('@teages/nitro-drizzle/dev')

type PushSchema = (
  imports: Record<string, unknown>,
  db: unknown,
) => Promise<{
  sqlStatements: string[]
  hints: { hint: string }[]
  apply: () => Promise<void>
}>

async function loadPushSchema(dialect: DevDialect): Promise<PushSchema> {
  if (dialect === 'postgresql') {
    const api = await import('drizzle-kit/api-postgres')
    return api.pushSchema as PushSchema
  }
  const api = await import('drizzle-kit/payload/sqlite')
  return api.pushSchema as PushSchema
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
    logger.warn(hint.hint)
  }
  await apply()
  return { statements: sqlStatements.length, hints: hints.map(h => h.hint) }
}
