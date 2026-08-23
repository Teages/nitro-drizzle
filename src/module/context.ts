import type { Nitro } from 'nitro/types'
import type { ResolvedDevDatabase } from '../config/dev-database'
import type { ResolvedDrizzleConfig } from '../config/types'
import type { DatabaseConnection } from '../types'
import { env } from 'node:process'
import {
  assertLocalDriverInstalled,
  detectDevRuntimeEngines,
  DEV_ENV_FLAG,
  resolveDevDatabase,
} from '../config/dev-database'
import {
  resolveConnectionFromEnv,
  resolveDrizzleEnvPrefixes,
} from '../config/env'
import { resolveDrizzleConfig, resolveDrizzleSchemaPath } from '../config/resolve'

export interface DrizzleModuleContext {
  readonly config: ResolvedDrizzleConfig
  readonly schemaPath: string
  readonly relationsExport: string | undefined
  readonly devDb: ResolvedDevDatabase | undefined
  readonly userConnection: DatabaseConnection
}

/**
 * Resolves the module inputs from the Nitro options: the effective Drizzle
 * config with environment connections merged in, plus the dev database when
 * dev mode is active. Returns `undefined` when the module stays disabled.
 */
export function resolveDrizzleModuleContext(
  nitro: Nitro,
): DrizzleModuleContext | undefined {
  if (nitro.options.drizzle === undefined) {
    return undefined
  }
  const envPrefixes = resolveDrizzleEnvPrefixes(
    nitro.options.runtimeConfig.nitro?.envPrefix,
    env,
  )
  const userConnection: DatabaseConnection
    = nitro.options.runtimeConfig.drizzle?.connection ?? {}
  const connection = resolveConnectionFromEnv(env, envPrefixes, userConnection)
  const { dev: _dev, ...drizzleOptions } = nitro.options.drizzle
  const config = resolveDrizzleConfig(
    {
      ...drizzleOptions,
      ...(Object.keys(connection).length > 0 ? { connection } : {}),
    },
    { serverDir: nitro.options.serverDir },
  )
  if (config === undefined) {
    return undefined
  }

  const devDb = nitro.options.dev
    && nitro.options.drizzle.dev !== undefined
    && env[DEV_ENV_FLAG] !== 'false'
    ? resolveDevDatabase({
        dev: nitro.options.drizzle.dev,
        dialect: config.dialect,
        driver: config.driver,
        env,
        runtime: detectDevRuntimeEngines(),
      })
    : undefined
  if (devDb !== undefined) {
    assertLocalDriverInstalled(devDb.engine, nitro.options.rootDir)
  }

  const schemaPath = resolveDrizzleSchemaPath(
    nitro.options.drizzle.schemaPath,
    config.dialect,
    nitro.options.rootDir,
  )
  return {
    config,
    schemaPath,
    relationsExport: nitro.options.drizzle.relationsExport,
    devDb,
    userConnection,
  }
}
