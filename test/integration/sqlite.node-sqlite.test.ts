import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { createDrizzleClient } from '../../src/drivers/create'
import { createAndApplyDrizzleMigrations } from '../../src/migrations/apply'
import { createMigrationWorkspace } from './fixtures'

describe('node-sqlite driver integration', () => {
  it('applies the migration folder, stays idempotent, and smoke-checks queries', async () => {
    // Given a file-backed SQLite database and a v1 migration folder
    const { rootDir, migrationsFolder } = await createMigrationWorkspace('node-sqlite', 'sqlite')
    const databasePath = join(rootDir, 'app.db')
    const config = {
      dialect: 'sqlite',
      driver: 'node-sqlite',
      connection: { url: databasePath },
    } as const

    // When migrations are applied twice through the orchestration layer
    const apply = () => createAndApplyDrizzleMigrations({ config, migrationsFolder })
    await expect(apply()).resolves.toEqual({ ok: true })
    await expect(apply()).resolves.toEqual({ ok: true })

    // Then a write through the generated client executor lands in the database
    const client = await createDrizzleClient(config)
    await client.execute(`INSERT INTO users (name) VALUES ('integration')`)
    await client.close()

    const verify = new DatabaseSync(databasePath)
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
