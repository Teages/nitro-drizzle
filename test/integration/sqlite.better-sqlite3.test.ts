import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { createDrizzleClient } from '../../src/database/client'
import { applyMigrationWorkspace, createMigrationWorkspace } from './fixtures'

describe('better-sqlite3 driver integration', () => {
  it('applies the migration folder, stays idempotent, and smoke-checks queries', async () => {
    // Given a file-backed SQLite database and a v1 migration folder
    const { rootDir, migrationsFolder } = await createMigrationWorkspace('better-sqlite3', 'sqlite')
    const databasePath = join(rootDir, 'app.db')
    const config = {
      dialect: 'sqlite',
      driver: 'better-sqlite3',
      connection: { url: databasePath },
    } as const

    // When migrations are applied twice through the fixture helper
    const apply = () => applyMigrationWorkspace(config, migrationsFolder)
    await expect(apply()).resolves.toEqual({ ok: true })
    await expect(apply()).resolves.toEqual({ ok: true })

    // Then a write through the generated client executor lands in the database
    const client = await createDrizzleClient(config)
    await client.execute(`INSERT INTO users (name) VALUES ('integration')`)
    await client.close()

    const verify = new Database(databasePath)
    try {
      expect(verify.prepare('SELECT id, name, email FROM users').all()).toEqual([
        { id: 1, name: 'integration', email: null },
      ])
      expect(
        verify.prepare('SELECT name FROM __drizzle_migrations ORDER BY id').all(),
      ).toEqual([
        { name: '20260819000000_create_users' },
        { name: '20260819000001_add_users_email' },
      ])
    }
    finally {
      verify.close()
    }
  })
})
