import type { DatabaseConnection } from '../types'

/**
 * Connection keys exposed as `<prefix>DRIZZLE_CONNECTION_<SUFFIX>` environment
 * variables, mirroring the keys nitro's runtime-config env application walks.
 */
const CONNECTION_ENV_SUFFIXES: Readonly<Record<string, string>> = {
  url: 'URL',
  uri: 'URI',
  authToken: 'AUTH_TOKEN',
  connectionString: 'CONNECTION_STRING',
  host: 'HOST',
  port: 'PORT',
  user: 'USER',
  password: 'PASSWORD',
  database: 'DATABASE',
  accountId: 'ACCOUNT_ID',
  apiToken: 'API_TOKEN',
  databaseId: 'DATABASE_ID',
  hyperdriveId: 'HYPERDRIVE_ID',
  dataDir: 'DATA_DIR',
}

export const DEFAULT_DRIZZLE_ENV_PREFIX = 'NITRO_'
const DEFAULT_ALT_DRIZZLE_ENV_PREFIX = '_'

/**
 * Nitro always probes the `NITRO_` prefix first, then the alternative prefix
 * configured via `runtimeConfig.nitro.envPrefix` or `NITRO_ENV_PREFIX`.
 */
export function resolveDrizzleEnvPrefixes(
  nitroEnvPrefix: string | undefined,
  env: Readonly<Record<string, string | undefined>>,
): readonly string[] {
  return [
    DEFAULT_DRIZZLE_ENV_PREFIX,
    nitroEnvPrefix ?? env.NITRO_ENV_PREFIX ?? DEFAULT_ALT_DRIZZLE_ENV_PREFIX,
  ]
}

function readDrizzleEnv(
  env: Readonly<Record<string, string | undefined>>,
  key: string,
  prefixes: readonly string[],
): string | undefined {
  for (const prefix of prefixes) {
    const value = env[`${prefix}${key}`]
    if (value !== undefined && value !== '') {
      return value
    }
  }
  return undefined
}

/**
 * Falsy placeholder for every connection key nitro's runtime-config env
 * application can walk, so `<prefix>DRIZZLE_CONNECTION_*` overrides work
 * even when the user configures no static defaults.
 */
export function emptyConnectionDefaults(): DatabaseConnection {
  return {
    url: '',
    uri: '',
    authToken: '',
    connectionString: '',
    host: '',
    port: 0,
    user: '',
    password: '',
    database: '',
    accountId: '',
    apiToken: '',
    databaseId: '',
    hyperdriveId: '',
    dataDir: '',
  }
}

/**
 * Collects connection credentials from `<prefix>DRIZZLE_CONNECTION_*`
 * environment variables. Env values win over the provided defaults.
 */
export function resolveConnectionFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  prefixes: readonly string[],
  defaults: DatabaseConnection = {},
): DatabaseConnection {
  const connection: DatabaseConnection = { ...defaults }
  for (const [key, suffix] of Object.entries(CONNECTION_ENV_SUFFIXES)) {
    const raw = readDrizzleEnv(env, `DRIZZLE_CONNECTION_${suffix}`, prefixes)
    if (raw === undefined) {
      continue
    }
    if (key === 'port') {
      const port = Number(raw)
      if (!Number.isFinite(port)) {
        throw new TypeError(`Invalid DRIZZLE_CONNECTION_PORT environment value: ${raw}`)
      }
      connection.port = port
    }
    else {
      connection[key] = raw
    }
  }
  return connection
}
