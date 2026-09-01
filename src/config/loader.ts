import type { Config as DrizzleKitConfig } from 'drizzle-kit'
import type { ResolvedDrizzleConfig } from '../configuration/resolve'
import type { DatabaseConnection, DrizzleOptions } from '../types'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { expandNitroEnv } from '../configuration/env'
import { resolveDrizzleConfig, resolveDrizzleSchemaPath } from '../configuration/resolve'

export interface LoadDrizzleConfigOptions {
  /** Project root the framework config is loaded from. Defaults to process.cwd(). */
  readonly cwd?: string
  /**
   * Framework the `drizzle` block is declared in. `nuxt` reads it from the
   * top-level `drizzle` key of the Nuxt config — matching the module, which
   * ignores `nitro.drizzle` there; `nitro` reads the Nitro config. Defaults
   * to detecting a `nuxt.config.*` file in the project root.
   */
  readonly framework?: 'nitro' | 'nuxt'
}

export class DrizzleConfigError extends Error {
  readonly code = 'drizzle_config_missing'

  constructor(message: string) {
    super(message)
    this.name = 'DrizzleConfigError'
  }
}

/** The `nuxt.config` extensions Nuxt's config loader accepts, in c12's order. */
const NUXT_CONFIG_EXTENSIONS
  = ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json', '.jsonc', '.json5', '.yaml', '.yml', '.toml']

/** The Nitro-config fields the drizzle-kit loader consumes, per framework. */
interface DrizzleConfigSource {
  readonly framework: 'nitro' | 'nuxt'
  readonly drizzle: DrizzleOptions | undefined
  readonly rootDir: string
  readonly serverDir: string | false
  readonly envExpansion: boolean

  /** Names the framework's config in error messages. */
  readonly configLabel: 'the Nitro config' | 'the Nuxt config'
}

function hasNuxtConfig(rootDir: string): boolean {
  return NUXT_CONFIG_EXTENSIONS.some(ext =>
    existsSync(resolve(rootDir, `nuxt.config${ext}`)),
  )
}

async function loadNitroSource(cwd: string | undefined): Promise<DrizzleConfigSource> {
  const { loadOptions } = await import('nitro/builder')
  const nitroOptions = await loadOptions(
    cwd === undefined ? undefined : { rootDir: cwd },
  )
  return {
    framework: 'nitro',
    drizzle: nitroOptions.drizzle,
    rootDir: nitroOptions.rootDir,
    serverDir: nitroOptions.serverDir,
    envExpansion: nitroOptions.experimental?.envExpansion === true,
    configLabel: 'the Nitro config',
  }
}

/** The subset of the Nuxt config's `nitro` options the loader maps onto Nitro's shape. */
interface NuxtNitroOptions {
  readonly serverDir?: string | boolean
  readonly experimental?: { readonly envExpansion?: boolean }
}

async function loadNuxtSource(cwd: string | undefined): Promise<DrizzleConfigSource> {
  const { loadNuxtConfig } = await import('@nuxt/kit')
  const nuxtOptions = await loadNuxtConfig(cwd === undefined ? {} : { cwd })
  const nitro = (nuxtOptions.nitro ?? {}) as NuxtNitroOptions
  return {
    framework: 'nuxt',
    // The module's options sit at its `drizzle` configKey; they are merged
    // into module options at install time, so this reads the raw key —
    // inline `modules` entries cannot be seen here.
    drizzle: (nuxtOptions as { drizzle?: DrizzleOptions }).drizzle,
    rootDir: nuxtOptions.rootDir,
    // Mirrors @nuxt/nitro-server: an explicit `nitro.serverDir` resolves
    // against srcDir, while the schema's serverDir already honors `dir.server`
    // from the project root.
    serverDir: typeof nitro.serverDir === 'string'
      ? resolve(nuxtOptions.rootDir, nuxtOptions.srcDir, nitro.serverDir)
      : nitro.serverDir === false ? false : nuxtOptions.serverDir,
    envExpansion: nitro.experimental?.envExpansion === true,
    configLabel: 'the Nuxt config',
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
    default:
      throw new DrizzleConfigError(
        `No drizzle-kit config mapping for driver "${config.driver}".`,
      )
  }
}

/**
 * Builds the drizzle-kit config from the framework config at runtime — the
 * Nitro config, or the Nuxt config when the project has a `nuxt.config.*` —
 * resolving the connection with the same code path the server uses and
 * pointing the schema at your source files, so it is always current. Use it
 * from a `drizzle.config.ts` in your project root so drizzle-kit picks the
 * config up without a `--config` flag.
 */
export async function loadDrizzleConfig(
  options: LoadDrizzleConfigOptions = {},
): Promise<DrizzleKitConfig> {
  const framework = options.framework
    ?? (hasNuxtConfig(options.cwd ?? process.cwd()) ? 'nuxt' : 'nitro')
  const source = framework === 'nuxt'
    ? await loadNuxtSource(options.cwd)
    : await loadNitroSource(options.cwd)
  const { drizzle: drizzleOptions } = source
  if (drizzleOptions?.dialect === undefined || drizzleOptions?.driver === undefined) {
    throw new DrizzleConfigError(
      `No \`drizzle\` dialect and driver found in ${source.configLabel}. Configure them under \`drizzle\` in ${source.configLabel}.`,
    )
  }

  const { devMock: _devMock, connection: userConnection, ...drizzle } = drizzleOptions
  // The CLI needs real credentials, so it applies Nitro's env expansion
  // semantics — `{{VAR}}` templates per the user's envExpansion setting —
  // to the static connection here.
  const connection = expandNitroEnv(userConnection ?? {}, {
    env: process.env,
    envExpansion: source.envExpansion || process.env.NITRO_ENV_EXPANSION === 'true',
  })
  const config = resolveDrizzleConfig(
    {
      ...drizzle,
      ...(Object.keys(connection).length > 0 ? { connection } : {}),
    },
    { serverDir: source.serverDir },
  )
  if (config?.migrationsDir === undefined) {
    throw new DrizzleConfigError(
      `No migrations directory resolved for drizzle-kit. Configure \`migrationsDir\` under \`drizzle\` in ${source.configLabel}.`,
    )
  }

  let schemaPath: string
  try {
    schemaPath = resolveDrizzleSchemaPath(
      drizzleOptions.schemaPath,
      config.dialect,
      source.rootDir,
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
