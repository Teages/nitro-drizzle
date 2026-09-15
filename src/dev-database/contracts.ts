import type { DrizzleLocalDriver } from '../types'

/**
 * The drizzle runtime hooks. The plugin calls and the generated consumer
 * declaration derive from these constants, so each hook name exists exactly
 * once in source.
 */
export const DRIZZLE_CONFIG_HOOK = 'drizzle:config' as const
export const DEV_DATABASE_SETUP_HOOK = 'drizzle:dev-mock:setup' as const
export const DEV_DATABASE_SEED_HOOK = 'drizzle:dev-mock:seed' as const

export interface ResolvedDevDatabase {
  readonly engine: DrizzleLocalDriver
  /** `undefined` only for an in-memory pglite. */
  readonly connection: string | undefined
}
