import type { Nitro } from 'nitro/types'
import type { ResolvedDrizzleConfig } from '../configuration/resolve'
import type { ResolvedDevDatabase } from '../dev-database/contracts'
import type { StudioSession } from '../studio/resolve'
import type { DatabaseConnection } from '../types'
import { env } from 'node:process'
import { resolveDrizzleConfig, resolveDrizzleSchemaPath } from '../configuration/resolve'
import {
  assertLocalDriverInstalled,
  detectDevRuntimeEngines,
  DEV_ENV_FLAG,
  resolveDevDatabase,
} from '../dev-database/resolve'
import { activateDevStudio, resolveDevStudio } from '../studio/resolve'

export interface DrizzleModuleContext {
  readonly config: ResolvedDrizzleConfig
  readonly schemaPath: string
  readonly relationsExport: string | undefined
  readonly devDb: ResolvedDevDatabase | undefined
  /** Normalized, port-resolved `drizzle.devMock.studio`; `undefined` means disabled. */
  readonly devStudio: StudioSession | undefined
  readonly userConnection: DatabaseConnection
}

/**
 * Resolves the module inputs from the Nitro options: the effective Drizzle
 * config with environment connections merged in, plus the dev database when
 * dev mode is active. The studio session acquires its port here so the rest
 * of the module — the printed link included — works with a known port.
 * Returns `undefined` when the module stays disabled.
 */
export async function resolveDrizzleModuleContext(
  nitro: Nitro,
): Promise<DrizzleModuleContext | undefined> {
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
  // The studio pairs exclusively with the dev database, so production
  // builds and env-disabled dev sessions skip resolution entirely — an
  // invalid `drizzle.devMock.studio` must not fail builds that ignore dev.
  const devStudio = devDb === undefined
    ? undefined
    : resolveDevStudio(
        devOptions === true || devOptions === undefined ? undefined : devOptions.studio,
      )
  return {
    config,
    schemaPath,
    relationsExport: nitro.options.drizzle.relationsExport,
    devDb,
    devStudio: devStudio === undefined ? undefined : await activateDevStudio(devStudio),
    userConnection,
  }
}
