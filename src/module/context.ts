import type { Nitro } from 'nitro/types'
import type { ResolvedDevDatabase } from '../config/dev-database'
import type { ResolvedDevStudio } from '../config/dev-studio'
import type { ResolvedDrizzleConfig } from '../config/types'
import type { DatabaseConnection } from '../types'
import { env } from 'node:process'
import {
  assertLocalDriverInstalled,
  detectDevRuntimeEngines,
  DEV_ENV_FLAG,
  resolveDevDatabase,
} from '../config/dev-database'
import { resolveDevStudio } from '../config/dev-studio'
import { resolveDrizzleConfig, resolveDrizzleSchemaPath } from '../config/resolve'

export interface DrizzleModuleContext {
  readonly config: ResolvedDrizzleConfig
  readonly schemaPath: string
  readonly relationsExport: string | undefined
  readonly devDb: ResolvedDevDatabase | undefined
  /** Normalized `drizzle.devMock.studio`; `undefined` means disabled. */
  readonly devStudio: ResolvedDevStudio | undefined
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
  // Build-time resolution stays static: `{{VAR}}` templates pass through
  // untouched and Nitro's runtime expands them per the user's envExpansion
  // setting. Only the drizzle-kit loader needs build-time expansion.
  const userConnection = nitro.options.drizzle.connection ?? {}
  const { devMock: _devMock, connection: _connection, ...drizzleOptions } = nitro.options.drizzle
  const config = resolveDrizzleConfig(
    {
      ...drizzleOptions,
      ...(Object.keys(userConnection).length > 0 ? { connection: userConnection } : {}),
    },
    { serverDir: nitro.options.serverDir },
  )
  if (config === undefined) {
    return undefined
  }

  const devDb = nitro.options.dev
    && nitro.options.drizzle.devMock !== undefined
    && env[DEV_ENV_FLAG] !== 'false'
    ? resolveDevDatabase({
        dev: nitro.options.drizzle.devMock,
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
  const devOptions = nitro.options.drizzle.devMock
  return {
    config,
    schemaPath,
    relationsExport: nitro.options.drizzle.relationsExport,
    devDb,
    // The studio pairs exclusively with the dev database, so production
    // builds and env-disabled dev sessions skip resolution entirely — an
    // invalid `drizzle.devMock.studio` must not fail builds that ignore dev.
    devStudio: devDb === undefined
      ? undefined
      : resolveDevStudio(
          devOptions === true || devOptions === undefined ? undefined : devOptions.studio,
        ),
    userConnection,
  }
}
