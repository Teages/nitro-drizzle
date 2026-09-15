import type { DrizzleLocalDriver } from '../types'

/**
 * Runtime hooks this package fires around the dev database lifecycle:
 * `config` before the client is constructed (handlers rewrite the connection
 * in place), `setup` once the client exists but before the schema is pushed,
 * `seed` once the schema is pushed. The plugin calls and the generated
 * consumer declaration both derive from these constants, so each hook name
 * exists exactly once in source.
 */
export const DEV_DATABASE_CONFIG_HOOK = 'drizzle:dev-mock:config' as const
export const DEV_DATABASE_SETUP_HOOK = 'drizzle:dev-mock:setup' as const
export const DEV_DATABASE_SEED_HOOK = 'drizzle:dev-mock:seed' as const

export interface ResolvedDevDatabase {
  readonly engine: DrizzleLocalDriver
  /**
   * Connection baked into the generated dev client. `undefined` only for an
   * in-memory pglite, which runs without a data directory.
   */
  readonly connection: string | undefined
}
