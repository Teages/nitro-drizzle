import type { Nitro } from 'nitro/types'
import type { ResolvedDrizzleConfig } from '../configuration/resolve'
import type { ResolvedDevDatabase } from '../dev-database/contracts'
import type { ResolvedDevStudio } from '../studio/resolve'
import type { DatabaseConnection } from '../types'
import { env } from 'node:process'
import { resolveDrizzleConfig, resolveDrizzleSchemaPath } from '../configuration/resolve'
import {
  assertLocalDriverInstalled,
  detectDevRuntimeEngines,
  DEV_ENV_FLAG,
  resolveDevDatabase,
} from '../dev-database/resolve'
import { resolveDevStudio } from '../studio/resolve'

export interface DrizzleModuleContext {
  readonly config: ResolvedDrizzleConfig
  readonly schemaPath: string
  readonly relationsExport: string | undefined
  readonly devDb: ResolvedDevDatabase | undefined
  /** Normalized, domain-minted `drizzle.devMock.studio`; `undefined` means disabled. */
  readonly devStudio: ResolvedDevStudio | undefined
  readonly userConnection: DatabaseConnection
}

/** The studio session is resolved here so the printed link and the runtime share one domain. */
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
    devStudio,
    userConnection,
  }
}
