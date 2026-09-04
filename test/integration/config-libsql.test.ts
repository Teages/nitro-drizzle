import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { loadDrizzleConfig } from '../../src/config/loader'

const execFileAsync = promisify(execFile)
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(path =>
      rm(path, { recursive: true, force: true }),
    ),
  )
})

describe('local libSQL drizzle-kit config', () => {
  it('migrates a file database twice without an auth token', async () => {
    // Given a Nitro config targeting a local libSQL database
    const rootDir = await mkdtemp(join(process.cwd(), '.test-drizzle-kit-libsql-'))
    temporaryDirectories.push(rootDir)
    const databaseFile = join(rootDir, 'local.db')
    const migrationDir = join(
      rootDir,
      'server/db/migrations/20260824000000_create_users',
    )
    await mkdir(migrationDir, { recursive: true })
    await writeFile(
      join(rootDir, 'server/db/schema.ts'),
      `import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
})
`,
    )
    await writeFile(
      join(migrationDir, 'migration.sql'),
      'CREATE TABLE users (id integer PRIMARY KEY, name text NOT NULL);\n',
    )
    await writeFile(
      join(rootDir, 'nitro.config.ts'),
      `import { defineConfig } from 'nitro/config'

export default defineConfig({
  serverDir: './server',
  drizzle: {
    dialect: 'sqlite',
    driver: 'libsql',
    schemaPath: './server/db/schema.ts',
    connection: { url: ${JSON.stringify(`file:${databaseFile}`)} },
  },
})
`,
    )

    // When the public loader output is passed to the real drizzle-kit CLI
    const config = await loadDrizzleConfig({ cwd: rootDir })
    expect('dbCredentials' in config ? config.dbCredentials : undefined).toEqual({
      url: `file:${databaseFile}`,
    })
    const drizzleConfig = join(rootDir, 'drizzle.config.mjs')
    await writeFile(
      drizzleConfig,
      `export default ${JSON.stringify(config, null, 2)}\n`,
    )
    for (let attempt = 0; attempt < 2; attempt++) {
      await execFileAsync(
        join(process.cwd(), 'node_modules/.bin/drizzle-kit'),
        ['migrate', '--config', drizzleConfig],
        { cwd: rootDir, env: process.env },
      )
    }

    // Then the migration is applied once and tracked in the real database
    const database = new DatabaseSync(databaseFile)
    try {
      expect(database.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'`,
      ).get()).toEqual({ name: 'users' })
      expect(database.prepare(
        'SELECT COUNT(*) AS count FROM __drizzle_migrations',
      ).get()).toEqual({ count: 1 })
    }
    finally {
      database.close()
    }
  })
})
