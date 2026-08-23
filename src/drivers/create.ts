import type { DatabaseConnection, DrizzleOptions } from '../types'
import type { DrizzleBuildClientConfig } from './contracts'
import type { OpaqueDrizzleDatabase } from './database'
import {
  createD1HttpTransport,
  resolveD1HttpCredentials,
} from './d1-http'
import {
  createCloser,
  createExecutor,
  invokeDrizzle,
  loadDrizzle,
} from './database'
import { DrizzleClientError } from './errors'

export interface DrizzleClient {
  readonly driver: DrizzleOptions['driver']
  readonly db: OpaqueDrizzleDatabase
  readonly execute: (query: string) => Promise<void>
  readonly close: () => Promise<void>
  /** Used only by drizzle-orm/sqlite-proxy/migrator. */
  readonly proxyMigration?: (queries: readonly string[]) => Promise<void>
}

function assertNever(value: never): never {
  throw new DrizzleClientError(
    'initialization_failed',
    value,
    `Unsupported Drizzle driver: ${String(value)}`,
  )
}

function connectionRecord(connection: DatabaseConnection | undefined): Record<string, unknown> {
  const parsed: Record<string, unknown> = {}
  if (connection === undefined) {
    return parsed
  }
  for (const [key, value] of Object.entries(connection)) {
    if (
      !['accountId', 'apiToken', 'databaseId', 'hyperdriveId'].includes(key)
      && value !== undefined
      && value !== ''
      && value !== 0
    ) {
      parsed[key] = value
    }
  }
  if (
    (connection.url === undefined || connection.url === '')
    && connection.connectionString !== undefined
    && connection.connectionString !== ''
  ) {
    parsed.url = connection.connectionString
  }
  delete parsed.connectionString
  return parsed
}

function connectionString(connection: DatabaseConnection | undefined): string | undefined {
  return connection?.url || connection?.connectionString || undefined
}

function requireConnectionString(
  driver: DrizzleOptions['driver'],
  connection: DatabaseConnection | undefined,
): string {
  const value = connectionString(connection)
  if (value === undefined || value === '') {
    throw new DrizzleClientError(
      'invalid_connection',
      driver,
      `${driver} requires an explicit connection.url or connection.connectionString.`,
    )
  }
  return value
}

async function initializeDatabase(
  config: DrizzleBuildClientConfig,
): Promise<{
  readonly database: OpaqueDrizzleDatabase
  readonly proxyMigration?: (queries: readonly string[]) => Promise<void>
}> {
  if (config.driver === 'd1') {
    throw new DrizzleClientError(
      'binding_only',
      config.driver,
      'The d1 driver requires a Cloudflare request binding. For build and CLI access, switch the driver to d1-http or better-sqlite3 in your Nitro config, or apply migrations with the Wrangler CLI.',
    )
  }
  if (
    config.connection?.hyperdriveId !== undefined
    && connectionString(config.connection) === undefined
  ) {
    throw new DrizzleClientError(
      'binding_only',
      config.driver,
      `${config.driver} is configured only with Hyperdrive, which requires Cloudflare request context. Add a direct connection URL for build and CLI access.`,
    )
  }

  const drizzle = await loadDrizzle(config.driver)
  if (config.driver === 'd1-http') {
    const credentials = resolveD1HttpCredentials(config.connection)
    if (credentials === undefined) {
      throw new DrizzleClientError(
        'invalid_connection',
        config.driver,
        'd1-http requires explicit accountId, apiToken, and databaseId values.',
      )
    }
    const transport = createD1HttpTransport(credentials)
    const database = invokeDrizzle(drizzle, [transport.query])
    return { database, proxyMigration: transport.migrate }
  }

  const connection = connectionRecord(config.connection)
  switch (config.driver) {
    case 'neon-http':
      return {
        database: invokeDrizzle(drizzle, [{
          connection: requireConnectionString(config.driver, config.connection),
        }]),
      }
    case 'libsql':
      requireConnectionString(config.driver, config.connection)
      return {
        database: invokeDrizzle(drizzle, [{ connection }]),
      }
    case 'mysql2':
      return {
        database: invokeDrizzle(drizzle, [{
          connection: connectionString(config.connection) ?? connection,
        }]),
      }
    case 'better-sqlite3':
    case 'bun-sqlite':
    case 'node-sqlite':
    case 'pglite':
      return {
        database: invokeDrizzle(drizzle, [{
          connection: connectionString(config.connection) ?? connection,
        }]),
      }
    case 'postgres-js':
      return {
        database: invokeDrizzle(drizzle, [{ connection }]),
      }
    default:
      return assertNever(config.driver)
  }
}

export interface CreateDrizzleClientFromDatabaseOptions {
  readonly dialect: DrizzleOptions['dialect']
  readonly driver: DrizzleOptions['driver']
  readonly database: OpaqueDrizzleDatabase
  readonly close?: () => Promise<void>
  readonly proxyMigration?: (queries: readonly string[]) => Promise<void>
}

export function createDrizzleClientFromDatabase(
  options: CreateDrizzleClientFromDatabaseOptions,
): DrizzleClient {
  return {
    driver: options.driver,
    db: options.database,
    execute: createExecutor(options.database, options.dialect),
    close: options.close ?? (() => Promise.resolve()),
    ...(options.proxyMigration === undefined
      ? {}
      : { proxyMigration: options.proxyMigration }),
  }
}

export async function createDrizzleClient(
  config: DrizzleBuildClientConfig,
): Promise<DrizzleClient> {
  try {
    const initialized = await initializeDatabase(config)
    return {
      driver: config.driver,
      db: initialized.database,
      execute: createExecutor(initialized.database, config.dialect),
      close: createCloser(initialized.database),
      ...(initialized.proxyMigration === undefined
        ? {}
        : { proxyMigration: initialized.proxyMigration }),
    }
  }
  catch (error) {
    if (error instanceof DrizzleClientError) {
      throw error
    }
    throw new DrizzleClientError(
      'initialization_failed',
      config.driver,
      `Failed to initialize the ${config.driver} Drizzle client.`,
      error,
    )
  }
}
