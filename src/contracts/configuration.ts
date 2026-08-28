import type { DatabaseConnection, DrizzleDialect, DrizzleDriver, DrizzleOptions } from '../types'

/**
 * The runtime `runtimeConfig.drizzle` shape. The module fills in the
 * resolved fields at build time; `connection` carries the raw user values
 * (env templates included) for Nitro's runtime to expand. Dialect and driver
 * are validated at runtime because they may be absent before setup runs.
 * `dev` is a module-injected flag that is `true` while the dev database is
 * active.
 */
export type DrizzleConfigInput = Omit<Partial<DrizzleOptions>, 'dev' | 'connection'> & {
  readonly connection?: DatabaseConnection
  readonly dev?: boolean
}

export interface ResolvedDrizzleConfig {
  readonly dialect: DrizzleDialect
  readonly driver: DrizzleDriver
  readonly connection?: DatabaseConnection
  readonly migrationsDir?: string
}
