import type { DrizzleDriverConfig } from '../../src/contracts/driver'
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { createDrizzleClient } from '../../src/database/client'

export type IntegrationDialect = 'sqlite' | 'postgresql' | 'mysql'

export interface MigrationWorkspace {
  readonly rootDir: string
  readonly migrationsFolder: string
}

const createUsersSql: Record<IntegrationDialect, string> = {
  sqlite: `CREATE TABLE users (
  id integer PRIMARY KEY AUTOINCREMENT,
  name text NOT NULL
);`,
  postgresql: `CREATE TABLE users (
  id serial PRIMARY KEY,
  name text NOT NULL
);`,
  mysql: `CREATE TABLE users (
  id int AUTO_INCREMENT PRIMARY KEY,
  name varchar(255) NOT NULL
);`,
}

const addUsersEmailSql: Record<IntegrationDialect, string> = {
  sqlite: `ALTER TABLE users ADD COLUMN email text;`,
  postgresql: `ALTER TABLE users ADD COLUMN email text;`,
  mysql: `ALTER TABLE users ADD COLUMN email varchar(255);`,
}

/**
 * Writes a Drizzle v1 migration folder (per-migration directories with
 * `migration.sql`) covering a fresh table plus a follow-up column change.
 */
export async function createMigrationWorkspace(
  prefix: string,
  dialect: IntegrationDialect,
): Promise<MigrationWorkspace> {
  const rootDir = await mkdtemp(join(tmpdir(), `nitro-drizzle-${prefix}-`))
  const migrationsFolder = join(rootDir, 'migrations')
  await writeMigration(migrationsFolder, '20260819000000_create_users', createUsersSql[dialect])
  await writeMigration(migrationsFolder, '20260819000001_add_users_email', addUsersEmailSql[dialect])
  return { rootDir, migrationsFolder }
}

async function writeMigration(
  migrationsFolder: string,
  name: string,
  sql: string,
): Promise<void> {
  const folder = join(migrationsFolder, name)
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, 'migration.sql'), sql)
}

const migrationsTable: Record<IntegrationDialect, string> = {
  sqlite: `CREATE TABLE IF NOT EXISTS __drizzle_migrations (
  id integer PRIMARY KEY AUTOINCREMENT,
  name text NOT NULL
)`,
  postgresql: `CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id serial PRIMARY KEY,
  name text NOT NULL
)`,
  mysql: `CREATE TABLE IF NOT EXISTS __drizzle_migrations (
  id int AUTO_INCREMENT PRIMARY KEY,
  name varchar(255) NOT NULL
)`,
}

const migrationsRow: Record<IntegrationDialect, string> = {
  sqlite: '__drizzle_migrations',
  postgresql: 'drizzle.__drizzle_migrations',
  mysql: '__drizzle_migrations',
}

/**
 * Test-only stand-in for the removed runtime migration task: applies each
 * `migration.sql` in order, exactly once, recording names the same way the
 * tests verify them.
 */
export async function applyMigrationWorkspace(
  config: DrizzleDriverConfig,
  migrationsFolder: string,
): Promise<{ ok: true }> {
  const client = await createDrizzleClient(config)
  // The wrapped executor is write-only, so reads go through the raw drizzle
  // instance: `all()` on sqlite, `execute()` everywhere else.
  const query = async (statement: string): Promise<readonly unknown[]> => {
    const raw = sql.raw(statement)
    if (config.dialect === 'sqlite') {
      return await (client.db as {
        all: (query: unknown) => Promise<unknown[]>
      }).all(raw)
    }
    const result = await (client.db as {
      // postgres-js resolves to the rows array, mysql2 to a [rows, fields]
      // tuple; everything else follows the { rows } result shape.
      execute: (query: unknown) => Promise<{ rows: unknown[] } | unknown[] | [unknown[], unknown]>
    }).execute(raw)
    if (Array.isArray(result)) {
      return Array.isArray(result[0]) ? result[0] : result
    }
    return result.rows
  }
  try {
    for (const statement of migrationsTable[config.dialect].split(';\n')) {
      await client.execute(statement)
    }
    const entries = (await readdir(migrationsFolder, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
    for (const name of entries) {
      const applied = await query(
        `SELECT 1 FROM ${migrationsRow[config.dialect]} WHERE name = '${name}'`,
      )
      if (applied.length > 0) {
        continue
      }
      await client.execute(
        await readFile(join(migrationsFolder, name, 'migration.sql'), 'utf8'),
      )
      await client.execute(
        `INSERT INTO ${migrationsRow[config.dialect]} (name) VALUES ('${name}')`,
      )
    }
  }
  finally {
    await client.close()
  }
  return { ok: true }
}
