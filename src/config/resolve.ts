import type { DrizzleDialect, DrizzleSchemaPath } from '../types'
import type { DrizzleConfigInput, ResolvedDrizzleConfig, ResolveDrizzleConfigOptions } from './types'
import { resolve } from 'node:path'

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
  options: ResolveDrizzleConfigOptions,
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
    ...(config.connection === undefined ? {} : { connection: config.connection }),
    ...(migrationsDir === undefined ? {} : { migrationsDir }),
  }
}
