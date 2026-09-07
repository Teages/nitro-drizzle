import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { MigrationConfig } from 'drizzle-orm/migrator'
import type { MySql2Database } from 'drizzle-orm/mysql2'
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { ResolvedDrizzleConfig } from '../../src/configuration/resolve'
import type { OpaqueDrizzleDatabase } from '../../src/database/drizzle'
import type { DrizzleDriver } from '../../src/types'
import { cp, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate as migrateBetterSqlite3 } from 'drizzle-orm/better-sqlite3/migrator'
import { migrate as migrateLibsql } from 'drizzle-orm/libsql/migrator'
import { migrate as migrateMysql2 } from 'drizzle-orm/mysql2/migrator'
import { migrate as migrateNodeSqlite } from 'drizzle-orm/node-sqlite/migrator'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { migrate as migratePostgresJs } from 'drizzle-orm/postgres-js/migrator'
import { createDrizzleClient } from '../../src/database/client'

export type IntegrationDialect = 'sqlite' | 'postgresql' | 'mysql'

/** The committed Nitro app every integration test migrates, builds, or runs. */
const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'base')

/** How the fixture config imports the module from the repository source. */
const FIXTURE_MODULE_IMPORT = `'../../../../src/index'`

/** Generated output that never belongs in a copy of the fixture app. */
const generatedEntries = new Set(['.nitro', '.data', '.output', 'dist', 'node_modules'])

export function fixtureMigrationsFolder(dialect: IntegrationDialect): string {
  return join(fixtureRoot, 'server/db/migrations', dialect)
}

/** The fixture's migration directory names, in application order. */
export async function fixtureMigrationNames(
  dialect: IntegrationDialect,
): Promise<readonly string[]> {
  const entries = await readdir(fixtureMigrationsFolder(dialect), { withFileTypes: true })
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
}

export interface CopyFixtureOptions {
  /**
   * Replaces the fixture config's module import: copies inside the repository
   * point at the source entry, the tarball test points at the published
   * package name.
   */
  readonly moduleSpecifier?: string
}

/** Copies the fixture app into `rootDir`, skipping generated output. */
export async function copyFixture(
  rootDir: string,
  options: CopyFixtureOptions = {},
): Promise<void> {
  await cp(fixtureRoot, rootDir, {
    recursive: true,
    filter: source => !generatedEntries.has(basename(source)),
  })
  if (options.moduleSpecifier === undefined) {
    return
  }
  const configFile = join(rootDir, 'nitro.config.ts')
  const config = await readFile(configFile, 'utf8')
  await writeFile(
    configFile,
    config.replace(FIXTURE_MODULE_IMPORT, JSON.stringify(options.moduleSpecifier)),
  )
}

/**
 * Runs drizzle-orm's own per-driver migrator — the same engine
 * `drizzle-kit migrate` drives. It reads the v1 migration folder layout,
 * applies pending `migration.sql` files in a transaction, and records a
 * `name` row per migration in the dialect's migrations table, so calling it
 * again is a no-op. The casts narrow the opaque client database back to the
 * concrete type each migrator was built for.
 */
async function migrateForDriver(
  driver: DrizzleDriver,
  db: OpaqueDrizzleDatabase,
  config: MigrationConfig,
): Promise<void> {
  switch (driver) {
    case 'better-sqlite3':
      migrateBetterSqlite3(db as BetterSQLite3Database, config)
      return
    case 'node-sqlite':
      migrateNodeSqlite(db as NodeSQLiteDatabase, config)
      return
    case 'libsql':
      await migrateLibsql(db as LibSQLDatabase, config)
      return
    case 'pglite':
      await migratePglite(db as PgliteDatabase, config)
      return
    case 'postgres-js':
      await migratePostgresJs(db as PostgresJsDatabase, config)
      return
    case 'mysql2':
      await migrateMysql2(db as MySql2Database, config)
      return
    default:
      throw new Error(`No drizzle migrator wired for driver "${driver}".`)
  }
}

/** Applies the fixture's migrations for `dialect` through the client under test. */
export async function applyFixtureMigrations(
  config: ResolvedDrizzleConfig,
  dialect: IntegrationDialect,
): Promise<void> {
  const client = await createDrizzleClient(config)
  try {
    await migrateForDriver(config.driver, client.db, {
      migrationsFolder: fixtureMigrationsFolder(dialect),
    })
  }
  finally {
    await client.close()
  }
}
