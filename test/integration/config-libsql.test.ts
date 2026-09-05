import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { loadDrizzleConfig } from '../../src/config/loader'
import { copyFixture } from './fixtures'

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
  it('migrates the fixture app twice without an auth token', async () => {
    // Given the base fixture app's schema and migrations, configured for a
    // local libSQL database
    const rootDir = await mkdtemp(join(process.cwd(), '.test-drizzle-kit-libsql-'))
    temporaryDirectories.push(rootDir)
    await copyFixture(rootDir)
    const databaseFile = join(rootDir, 'local.db')
    await writeFile(
      join(rootDir, 'nitro.config.ts'),
      `import { defineConfig } from 'nitro/config'

export default defineConfig({
  serverDir: './server',
  drizzle: {
    dialect: 'sqlite',
    driver: 'libsql',
    schemaPath: './server/db/schema.sqlite.ts',
    migrationsDir: './server/db/migrations/sqlite',
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

    // Then the fixture's migration is applied once and tracked in the real database
    const database = new DatabaseSync(databaseFile)
    try {
      expect(database.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'counts'`,
      ).get()).toEqual({ name: 'counts' })
      expect(database.prepare(
        'SELECT COUNT(*) AS count FROM __drizzle_migrations',
      ).get()).toEqual({ count: 1 })
    }
    finally {
      database.close()
    }
  })
})
