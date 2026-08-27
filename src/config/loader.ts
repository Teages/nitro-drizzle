import type { Config as DrizzleKitConfig } from 'drizzle-kit'
import type { DatabaseConnection } from '../types'
import type { ResolvedDrizzleConfig } from './types'
import process from 'node:process'
import { expandNitroEnv } from './env'
import { resolveDrizzleConfig, resolveDrizzleSchemaPath } from './resolve'

export interface LoadDrizzleConfigOptions {
  /** Project root the Nitro config is loaded from. Defaults to process.cwd(). */
  readonly cwd?: string
}

export class DrizzleConfigError extends Error {
  readonly code = 'drizzle_config_missing'

  constructor(message: string) {
    super(message)
    this.name = 'DrizzleConfigError'
  }
}

function kitUrl(credentials: DatabaseConnection): string | undefined {
  return credentials.url || credentials.connectionString || undefined
}

function hostCredentials(credentials: DatabaseConnection): {
  host: string
  port?: number
  user?: string
  password?: string
  database: string
} {
  return {
    host: credentials.host ?? '',
    // drizzle-kit types port as a number; numeric strings — e.g. expanded
    // `{{VAR}}` templates — coerce here, everything unset-shaped stays out.
    ...(credentials.port === undefined || credentials.port === 0 || credentials.port === ''
      ? {}
      : { port: Number(credentials.port) }),
    ...(credentials.user === undefined ? {} : { user: credentials.user }),
    ...(credentials.password === undefined ? {} : { password: credentials.password }),
    database: credentials.database ?? '',
  }
}

/**
 * Maps the resolved runtime connection onto drizzle-kit credentials the same
 * way the runtime applies them: static connection values with `{{VAR}}`
 * expansion per the user's envExpansion setting. Each branch matches
 * one member of drizzle-kit's discriminated Config union — no casts, so a
 * credential mixup fails to compile here instead of failing inside
 * drizzle-kit at config validation or connect time.
 */
function kitConfig(
  config: ResolvedDrizzleConfig,
  connection: DatabaseConnection | undefined,
  schema: string[],
  out: string,
): DrizzleKitConfig {
  const credentials: DatabaseConnection = connection ?? {}
  switch (config.driver) {
    case 'libsql':
      return {
        dialect: 'turso',
        schema,
        out,
        dbCredentials: {
          url: credentials.url ?? '',
          ...(credentials.authToken === undefined || credentials.authToken === ''
            ? {}
            : { authToken: credentials.authToken }),
        },
      }
    case 'better-sqlite3':
    case 'bun-sqlite':
    case 'node-sqlite':
      return {
        dialect: 'sqlite',
        schema,
        out,
        dbCredentials: { url: credentials.url ?? '' },
      }
    case 'd1':
    case 'd1-http': {
      // drizzle-kit has no binding transport, so even the binding driver
      // goes through the HTTP API. Missing credentials stay empty strings:
      // `drizzle-kit generate` never connects, so it must keep working
      // without them.
      return {
        dialect: 'sqlite',
        driver: 'd1-http',
        schema,
        out,
        dbCredentials: {
          accountId: credentials.accountId ?? '',
          databaseId: credentials.databaseId ?? '',
          token: credentials.apiToken ?? '',
        },
      }
    }
    case 'pglite':
      // Mirror the generated client's priority: the dedicated dataDir field
      // wins over the generic url/connectionString forms.
      return {
        dialect: 'postgresql',
        driver: 'pglite',
        schema,
        out,
        dbCredentials: {
          url: credentials.dataDir || credentials.url || credentials.connectionString || '',
        },
      }
    case 'postgres-js':
    case 'neon-http': {
      const url = kitUrl(credentials)
      return {
        dialect: 'postgresql',
        schema,
        out,
        dbCredentials: url === undefined || url === ''
          ? hostCredentials(credentials)
          : { url },
      }
    }
    case 'mysql2': {
      const url = credentials.url || credentials.connectionString || credentials.uri
      return {
        dialect: 'mysql',
        schema,
        out,
        dbCredentials: url === undefined || url === ''
          ? hostCredentials(credentials)
          : { url },
      }
    }
  }
}

/**
 * Builds the drizzle-kit config from the Nitro config at runtime, resolving
 * the connection with the same code path the server uses and pointing the
 * schema at your source files, so it is always current. Use it from a
 * `drizzle.config.ts` in your project root so drizzle-kit picks the config
 * up without a `--config` flag.
 */
export async function loadDrizzleConfig(
  options: LoadDrizzleConfigOptions = {},
): Promise<DrizzleKitConfig> {
  const { loadOptions } = await import('nitro/builder')
  const nitroOptions = await loadOptions(
    options.cwd === undefined ? undefined : { rootDir: options.cwd },
  )
  if (
    nitroOptions.drizzle?.dialect === undefined
    || nitroOptions.drizzle?.driver === undefined
  ) {
    throw new DrizzleConfigError(
      'No `drizzle` dialect and driver found in the Nitro config. Configure them under `drizzle` in your Nitro config.',
    )
  }

  const { devMock: _devMock, connection: userConnection, ...drizzle } = nitroOptions.drizzle
  // The CLI needs real credentials, so it applies Nitro's env expansion
  // semantics — `{{VAR}}` templates per the user's envExpansion setting —
  // to the static connection here.
  const connection = expandNitroEnv(userConnection ?? {}, {
    env: process.env,
    envExpansion: nitroOptions.experimental?.envExpansion === true
      || process.env.NITRO_ENV_EXPANSION === 'true',
  })
  const config = resolveDrizzleConfig(
    {
      ...drizzle,
      ...(Object.keys(connection).length > 0 ? { connection } : {}),
    },
    { serverDir: nitroOptions.serverDir },
  )
  if (config?.migrationsDir === undefined) {
    throw new DrizzleConfigError(
      'No migrations directory resolved for drizzle-kit. Configure `migrationsDir` under `drizzle` in your Nitro config.',
    )
  }

  let schemaPath: string
  try {
    schemaPath = resolveDrizzleSchemaPath(
      nitroOptions.drizzle.schemaPath,
      config.dialect,
      nitroOptions.rootDir,
    )
  }
  catch (error) {
    throw new DrizzleConfigError(
      error instanceof Error ? error.message : String(error),
    )
  }

  return kitConfig(
    config,
    connection,
    [schemaPath],
    config.migrationsDir,
  )
}
