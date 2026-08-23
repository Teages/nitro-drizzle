import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import { createDrizzleClient } from '../../src/drivers/create'
import { createAndApplyDrizzleMigrations } from '../../src/migrations/apply'
import { createMigrationWorkspace } from './fixtures'

describe('libsql driver integration', () => {
  it('applies the migration folder, stays idempotent, and smoke-checks queries', async () => {
    // Given a file-backed libSQL database and a v1 migration folder
    const { rootDir, migrationsFolder } = await createMigrationWorkspace('libsql', 'sqlite')
    const databasePath = join(rootDir, 'app.db')
    const config = {
      dialect: 'sqlite',
      driver: 'libsql',
      connection: { url: `file:${databasePath}` },
    } as const

    // When migrations are applied twice through the orchestration layer
    const apply = () => createAndApplyDrizzleMigrations({ config, migrationsFolder })
    await expect(apply()).resolves.toEqual({ ok: true })
    await expect(apply()).resolves.toEqual({ ok: true })

    // Then a write through the generated client executor lands in the database
    const client = await createDrizzleClient(config)
    await client.execute(`INSERT INTO users (name) VALUES ('integration')`)
    await client.close()

    const verify = createClient({ url: `file:${databasePath}` })
    try {
      const users = await verify.execute('SELECT id, name, email FROM users')
      expect(users.rows).toEqual([{ id: 1, name: 'integration', email: null }])
      const migrations = await verify.execute(
        'SELECT name FROM __drizzle_migrations ORDER BY id',
      )
      expect(migrations.rows.map(row => row.name)).toEqual([
        '20260819000000_create_users',
        '20260819000001_add_users_email',
      ])
    }
    finally {
      verify.close()
    }
  })
})
