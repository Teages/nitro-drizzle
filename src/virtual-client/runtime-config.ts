import type { DatabaseConnection, DrizzleDialect, DrizzleDriver, DrizzleLocalDriver } from '../types'

/**
 * Shape of the generated `#drizzle/config` virtual module: the module-owned
 * runtime configuration. Connection values are the raw user input (env
 * templates included); env semantics apply when the connection is resolved,
 * never at build time. The resolver is copied into the module so the
 * consumer bundle does not import this package's runtime.
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
    /** Per-session `<uuid>.localhost` host the studio answers to. */
    readonly localhostDomain: string
    readonly studioUrl: string
  }
  readonly connection: DatabaseConnection
}

export function createRuntimeConfigModule(config: RuntimeDrizzleConfig): string {
  return `import { env } from 'node:process'
import { useRuntimeConfig } from 'nitro/runtime-config'

const resolvedConnections = new WeakMap()
const ENV_EXPANSION_PATTERN = /\\{\\{([^{}]*)\\}\\}/g

function expandConnection(connection, envExpansion) {
  if (!envExpansion)
    return connection
  const walk = (obj) => {
    for (const key in obj) {
      const value = obj[key]
      if (value !== null && typeof value === 'object' && !Array.isArray(value))
        walk(value)
      else if (typeof value === 'string')
        obj[key] = value.replace(ENV_EXPANSION_PATTERN, (match, name) => env[name] || match)
    }
  }
  const result = { ...connection }
  walk(result)
  return result
}

function resolveDrizzleConnection(connection) {
  const cached = resolvedConnections.get(connection)
  if (cached !== undefined)
    return cached
  const nitro = useRuntimeConfig().nitro ?? {}
  const result = expandConnection(connection, Boolean(nitro.envExpansion ?? env.NITRO_ENV_EXPANSION))
  resolvedConnections.set(connection, result)
  return result
}

export const drizzleConfig = ${JSON.stringify(config, null, 2)}

export function useDrizzleConnection() {
  return resolveDrizzleConnection(drizzleConfig.connection)
}
`
}
