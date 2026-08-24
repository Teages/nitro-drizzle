import type { DatabaseConnection, DrizzleClientDriver, DrizzleDialect } from '../../types'

/**
 * Shape of the generated `#drizzle/config` virtual module: the module-owned
 * runtime configuration. Connection values are the raw user input (env
 * templates included); env semantics apply when the connection is resolved,
 * never at build time.
 */
export interface RuntimeDrizzleConfig {
  readonly dialect: DrizzleDialect
  readonly driver: DrizzleClientDriver
  readonly migrationsDir: string
  readonly dev: boolean
  readonly connection: DatabaseConnection
}

export function createRuntimeConfigModule(config: RuntimeDrizzleConfig): string {
  return `import { resolveDrizzleConnection } from '@teages/nitro-drizzle/runtime/connection'

export const drizzleConfig = ${JSON.stringify(config, null, 2)}

export function useDrizzleConnection() {
  return resolveDrizzleConnection(drizzleConfig.connection)
}
`
}
