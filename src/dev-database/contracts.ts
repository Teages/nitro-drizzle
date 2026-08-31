import type { DrizzleLocalDriver } from '../types'

/**
 * Runtime hook this package fires once the dev database is ready: schema
 * pushed, migrations applied. The plugin call and the generated consumer
 * declaration both derive from this constant, so the hook name exists
 * exactly once in source.
 */
export const DEV_DATABASE_SEED_HOOK = 'drizzle:dev-mock:seed' as const

export interface ResolvedDevDatabase {
  readonly engine: DrizzleLocalDriver
  /**
   * Connection baked into the generated dev client. `undefined` only for an
   * in-memory pglite, which runs without a data directory.
   */
  readonly connection: string | undefined
}
