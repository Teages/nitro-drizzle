import type { DrizzleDevOptions, DrizzleLocalDriver } from '../types'
import type { DrizzleDialect, DrizzleDriver } from './types'
import { createRequire } from 'node:module'
import { isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'

export const DEV_ENV_FLAG = 'NITRO_DRIZZLE_DEV'
export const DEV_ENV_FILE = 'NITRO_DRIZZLE_DEV_FILE'

const LOCAL_DRIVERS_BY_DIALECT: Readonly<Record<DrizzleDialect, readonly DrizzleLocalDriver[]>> = {
  postgresql: ['pglite'],
  sqlite: ['better-sqlite3', 'libsql', 'bun-sqlite', 'node-sqlite'],
  mysql: [],
}

const LOCAL_DRIVER_PACKAGES: Readonly<Partial<Record<DrizzleLocalDriver, string>>> = {
  'pglite': '@electric-sql/pglite',
  'better-sqlite3': 'better-sqlite3',
  'libsql': '@libsql/client',
}

export class DrizzleDevDatabaseError extends Error {
  constructor(
    readonly code:
      | 'dialect_unsupported'
      | 'driver_not_local'
      | 'no_local_engine'
      | 'engine_not_installed',
    message: string,
  ) {
    super(message)
    this.name = 'DrizzleDevDatabaseError'
  }
}

export interface DevRuntimeEngines {
  readonly bun: boolean
  readonly nodeSqlite: boolean
}

export interface ResolveDevDatabaseOptions {
  readonly dev: true | DrizzleDevOptions
  readonly dialect: DrizzleDialect
  readonly driver: DrizzleDriver
  readonly env: Readonly<Record<string, string | undefined>>
  readonly runtime: DevRuntimeEngines
}

export interface ResolvedDevDatabase {
  readonly engine: DrizzleLocalDriver
  /**
   * Connection baked into the generated dev client. `undefined` only for an
   * in-memory pglite, which runs without a data directory.
   */
  readonly connection: string | undefined
}

/**
 * `process.features.sqlite` is not a reliable signal across Node versions —
 * Node 24 ships `node:sqlite` unflagged without setting it — so the builtin
 * is probed by loading it.
 */
export function detectDevRuntimeEngines(
  host: { readonly versions?: unknown } = process,
): DevRuntimeEngines {
  const versions = host.versions as { readonly bun?: unknown } | undefined
  return {
    bun: versions?.bun !== undefined,
    nodeSqlite: canLoadNodeSqlite(),
  }
}

function canLoadNodeSqlite(): boolean {
  try {
    createRequire(import.meta.url)('node:sqlite')
    return true
  }
  catch {
    return false
  }
}

export function resolveDevDatabase(
  options: ResolveDevDatabaseOptions,
): ResolvedDevDatabase {
  const { dev, dialect, driver, env, runtime } = options
  const localDrivers = LOCAL_DRIVERS_BY_DIALECT[dialect]
  if (localDrivers.length === 0) {
    throw new DrizzleDevDatabaseError(
      'dialect_unsupported',
      `The '${dialect}' dialect does not support the dev database.`,
    )
  }

  const requested = dev === true ? undefined : dev.driver
  let engine: DrizzleLocalDriver
  if (requested !== undefined) {
    if (!localDrivers.includes(requested)) {
      throw new DrizzleDevDatabaseError(
        'driver_not_local',
        `drizzle.dev.driver '${requested}' is not a local ${dialect} engine. Available engines: ${localDrivers.join(', ')}.`,
      )
    }
    engine = requested
  }
  else if (dialect === 'postgresql') {
    engine = 'pglite'
  }
  else if (runtime.bun) {
    engine = 'bun-sqlite'
  }
  else if (runtime.nodeSqlite) {
    engine = 'node-sqlite'
  }
  else if (driver === 'better-sqlite3' || driver === 'libsql') {
    engine = driver
  }
  else {
    throw new DrizzleDevDatabaseError(
      'no_local_engine',
      `No local sqlite engine is available for the dev database. Set drizzle.dev.driver to one of: ${localDrivers.join(', ')}.`,
    )
  }

  const configuredFile = dev === true ? undefined : dev.file
  const file = env[DEV_ENV_FILE] !== undefined && env[DEV_ENV_FILE] !== ''
    ? env[DEV_ENV_FILE]
    : configuredFile

  return { engine, connection: resolveDevConnection(engine, file) }
}

function resolveDevConnection(
  engine: DrizzleLocalDriver,
  file: string | undefined,
): string | undefined {
  if (file === undefined || file === '') {
    return engine === 'pglite' ? undefined : ':memory:'
  }
  if (engine === 'libsql' && !/^(?:file:|:memory:|libsql:|https?:)/.test(file)) {
    return `file:${file}`
  }
  return file
}

/**
 * Fails fast when the resolved engine needs a package the project has not
 * installed. `bun-sqlite` and `node-sqlite` run on built-in modules.
 */
export function assertLocalDriverInstalled(
  engine: DrizzleLocalDriver,
  rootDir: string,
): void {
  const packageName = LOCAL_DRIVER_PACKAGES[engine]
  if (packageName === undefined) {
    return
  }
  const manifest = isAbsolute(rootDir)
    ? join(rootDir, 'package.json')
    : resolve(process.cwd(), rootDir, 'package.json')
  const require = createRequire(manifest)
  try {
    require.resolve(packageName)
  }
  catch {
    throw new DrizzleDevDatabaseError(
      'engine_not_installed',
      `The ${engine} dev engine requires the ${packageName} package. Install it as a development dependency.`,
    )
  }
}
