import type { DatabaseConnection, DrizzleDialect, DrizzleOptions } from '../types'

export type { DrizzleDialect } from '../types'
export type DrizzleDriver = DrizzleOptions['driver']

export interface ResolveDrizzleConfigOptions {
  readonly serverDir: string | false
}

/**
 * The `runtimeConfig.drizzle` shape. Users configure `connection` defaults;
 * the module fills in the resolved fields at build time. Dialect and driver
 * are validated at runtime because they may be absent before setup runs.
 * `dev` is a module-injected flag that is `true` while the dev database is
 * active.
 */
export type DrizzleConfigInput = Omit<Partial<DrizzleOptions>, 'dev'> & {
  readonly connection?: DatabaseConnection
  readonly dev?: boolean
}

export interface ResolvedDrizzleConfig {
  readonly dialect: DrizzleDialect
  readonly driver: DrizzleDriver
  readonly connection?: DatabaseConnection
  readonly migrationsDir?: string
}
