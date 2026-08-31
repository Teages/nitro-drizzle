import type { DatabaseConnection, DrizzleDialect, DrizzleDriver, DrizzleLocalDriver } from '../types'

/**
 * Shape of the generated `#drizzle/config` virtual module: the module-owned
 * runtime configuration. Connection values are the raw user input (env
 * templates included); env semantics apply when the connection is resolved,
 * never at build time.
 */
export interface RuntimeDrizzleConfig {
  readonly dialect: DrizzleDialect
  readonly driver: DrizzleDriver
  readonly devMock: boolean
  /** Engine the dev database runs on; only present in dev-database mode. */
  readonly devEngine?: DrizzleLocalDriver
  /** Dev-database connection (`:memory:` style string); absent for in-memory pglite. */
  readonly devConnection?: string
  /** Normalized `drizzle.devMock.studio`; only present when the studio is enabled. */
  readonly devStudio?: {
    readonly port: number
    readonly silent: boolean
    readonly studioUrl: string
  }
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
