import type { DatabaseConnection } from '../types'
import { env } from 'node:process'
import { useRuntimeConfig } from 'nitro/runtime-config'
import { applyNitroEnv } from '../config/env'

const resolved = new WeakMap<object, DatabaseConnection>()

/**
 * Resolves the static `drizzle.connection` at runtime with Nitro's env
 * semantics: `<prefix>DRIZZLE_CONNECTION_*` overrides and `{{VAR}}`
 * expansion, gated by the user's `envExpansion` setting exactly like Nitro
 * applies it to its own runtime config. The module owns this resolution so
 * connection values never pass through `runtimeConfig` at all.
 */
export function resolveDrizzleConnection(
  connection: DatabaseConnection,
): DatabaseConnection {
  const cached = resolved.get(connection)
  if (cached !== undefined) {
    return cached
  }
  const nitro = useRuntimeConfig().nitro ?? {}
  const result = applyNitroEnv(connection, {
    env,
    envPrefix: nitro.envPrefix,
    envExpansion: Boolean(nitro.envExpansion ?? env.NITRO_ENV_EXPANSION),
  })
  resolved.set(connection, result)
  return result
}
