import type { DatabaseConnection } from '../../types'
import { env } from 'node:process'
import { useRuntimeConfig } from 'nitro/runtime-config'
import { expandNitroEnv } from '../env'

const resolved = new WeakMap<object, DatabaseConnection>()

/**
 * Resolves the static `drizzle.connection` at runtime with Nitro's env
 * expansion semantics: `{{VAR}}` templates expand from the environment when
 * the user enables `experimental.envExpansion`. The module owns this
 * resolution so connection values never pass through `runtimeConfig` at all.
 */
export function resolveDrizzleConnection(
  connection: DatabaseConnection,
): DatabaseConnection {
  const cached = resolved.get(connection)
  if (cached !== undefined) {
    return cached
  }
  const nitro = useRuntimeConfig().nitro ?? {}
  const result = expandNitroEnv(connection, {
    env,
    envExpansion: Boolean(nitro.envExpansion ?? env.NITRO_ENV_EXPANSION),
  })
  resolved.set(connection, result)
  return result
}
