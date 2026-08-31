import type { DatabaseConnection, DrizzleDialect, DrizzleDriver, DrizzleOptions, DrizzleSchemaPath } from '../types'
import { resolve } from 'node:path'

export interface ResolvedDrizzleConfig {
  readonly dialect: DrizzleDialect
  readonly driver: DrizzleDriver
  readonly connection?: DatabaseConnection
  readonly migrationsDir?: string
}

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

export function resolveDrizzleSchemaPath(
  schemaPath: DrizzleSchemaPath | undefined,
  dialect: DrizzleDialect,
  rootDir: string,
): string {
  const configured = typeof schemaPath === 'string'
    ? schemaPath
    : schemaPath?.[dialect]
  if (configured === undefined) {
    throw new Error(
      `No schemaPath configured for Drizzle dialect "${dialect}".`,
    )
  }
  return resolve(rootDir, configured)
}

export function resolveDrizzleConfig(
  config: DrizzleConfigInput | undefined,
  options: { serverDir: string | false },
): ResolvedDrizzleConfig | undefined {
  if (config?.dialect === undefined || config.driver === undefined) {
    return undefined
  }

  const migrationsDir = config.migrationsDir ?? (
    options.serverDir === false
      ? undefined
      : resolve(options.serverDir, 'db/migrations', config.dialect)
  )

  return {
    dialect: config.dialect,
    driver: config.driver,
    connection: config.connection,
    migrationsDir,
  }
}
