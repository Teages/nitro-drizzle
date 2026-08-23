import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
