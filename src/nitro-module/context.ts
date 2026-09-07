import type { ResolvedDrizzleConfig } from '../configuration/resolve'
import type { ResolvedDevDatabase } from '../dev-database/contracts'
import type { ResolvedDevStudio } from '../studio/resolve'
import type {
  DatabaseConnection,
  DrizzleDevMockOptions,
  DrizzleDialect,
  DrizzleDriver,
  DrizzleLocalDriver,
  DrizzleOptions,
} from '../types'
import { env } from 'node:process'
import { resolveDrizzleConfig, resolveDrizzleSchemaPath } from '../configuration/resolve'
import {
  assertLocalDriverInstalled,
  detectDevRuntimeEngines,
  DEV_ENV_FLAG,
  DrizzleDevDatabaseError,
  resolveDevDatabase,
} from '../dev-database/resolve'
import { resolveDrizzleTypesDir } from '../schema-artifacts/generate'
import { resolveDevStudio } from '../studio/resolve'

/**
 * The framework-agnostic inputs the context resolves from: Nitro passes its
 * options, the Nuxt module passes its own when it generates types during
 * `prepare:types`.
 */
export interface DrizzleModuleHost {
  readonly drizzle: DrizzleOptions
  readonly rootDir: string
  readonly serverDir: string | false
  readonly dev: boolean
}

export interface DrizzleModuleContext {
  readonly config: ResolvedDrizzleConfig
  readonly schemaPath: string
  readonly relationsExport: string | undefined
  readonly devDb: ResolvedDevDatabase | undefined
  /**
   * Engine the declarations type `mockDb` for, resolved from the configured
   * `drizzle.devMock` regardless of whether this session activated the dev
   * database — dev and production preparations emit identical declarations.
   * `undefined` when devMock is unset or cannot resolve to a local engine;
   * invalid combos only fail dev sessions, which surface the real error.
   */
  readonly mockEngine: DrizzleLocalDriver | undefined
  /** Normalized, domain-minted `drizzle.devMock.studio`; `undefined` means disabled. */
  readonly devStudio: ResolvedDevStudio | undefined
  readonly userConnection: DatabaseConnection
  /** Absolute directory for the generated type declarations; `false` disables generation. */
  readonly typesDir: string | false
}

/** The studio session is resolved here so the printed link and the runtime share one domain. */
export async function resolveDrizzleModuleContext(
  host: DrizzleModuleHost,
): Promise<DrizzleModuleContext | undefined> {
  const { drizzle } = host
  // Build-time resolution stays static: `{{VAR}}` templates pass through
  // untouched and Nitro's runtime expands them per the user's envExpansion
  // setting. Only the drizzle-kit loader needs build-time expansion.
  const userConnection = drizzle.connection ?? {}
  const { devMock: _devMock, connection: _connection, ...drizzleOptions } = drizzle
  const config = resolveDrizzleConfig(
    {
      ...drizzleOptions,
      ...(Object.keys(userConnection).length > 0 ? { connection: userConnection } : {}),
    },
    { serverDir: host.serverDir },
  )
  if (config === undefined) {
    return undefined
  }

  const devDb = host.dev
    && drizzle.devMock !== undefined
    && env[DEV_ENV_FLAG] !== 'false'
    ? resolveDevDatabase({
        dev: drizzle.devMock,
        dialect: config.dialect,
        driver: config.driver,
        env,
        runtime: detectDevRuntimeEngines(),
      })
    : undefined
  if (devDb !== undefined) {
    assertLocalDriverInstalled(devDb.engine, host.rootDir)
  }

  const mockEngine = devDb?.engine
    ?? (drizzle.devMock === undefined
      ? undefined
      : tryResolveMockEngine(drizzle.devMock, config.dialect, config.driver))

  const schemaPath = resolveDrizzleSchemaPath(
    drizzle.schemaPath,
    config.dialect,
    host.rootDir,
  )
  const devOptions = drizzle.devMock
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
    relationsExport: drizzle.relationsExport,
    devDb,
    mockEngine,
    devStudio,
    userConnection,
    typesDir: resolveDrizzleTypesDir(
      host.rootDir,
      drizzle.typesDir,
    ),
  }
}

/**
 * Engine the declarations type `mockDb` for, resolved exactly the way a dev
 * session resolves it so both agree on the same machine. `env` stays empty:
 * the file override never picks the engine. Sessions that ignore dev must
 * not fail on an invalid devMock — typing degrades to `undefined` instead.
 */
function tryResolveMockEngine(
  dev: true | DrizzleDevMockOptions,
  dialect: DrizzleDialect,
  driver: DrizzleDriver,
): DrizzleLocalDriver | undefined {
  try {
    const resolved = resolveDevDatabase({
      dev,
      dialect,
      driver,
      env: {},
      runtime: detectDevRuntimeEngines(),
    })
    return resolved.engine
  }
  catch (error) {
    if (error instanceof DrizzleDevDatabaseError) {
      return undefined
    }
    throw error
  }
}
