import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'
import { createDrizzleClient } from '../../src/database/client'
import { applyMigrationWorkspace, createMigrationWorkspace } from './fixtures'

describe('pglite driver integration', () => {
  it('applies the migration folder, stays idempotent, and smoke-checks queries', async () => {
    // Given a directory-backed PGlite database and a v1 migration folder
    const { rootDir, migrationsFolder } = await createMigrationWorkspace('pglite', 'postgresql')
    const dataDir = join(rootDir, 'pgdata')
    const config = {
      dialect: 'postgresql',
      driver: 'pglite',
      connection: { dataDir },
    } as const

    // When migrations are applied twice through the fixture helper
    const apply = () => applyMigrationWorkspace(config, migrationsFolder)
    await expect(apply()).resolves.toEqual({ ok: true })
    await expect(apply()).resolves.toEqual({ ok: true })

    // Then a write through the generated client executor lands in the database
    const client = await createDrizzleClient(config)
    await client.execute(`INSERT INTO users (name) VALUES ('integration')`)
    await client.close()

    const verify = new PGlite(dataDir)
    try {
      const users = await verify.query<{ id: number, name: string, email: string | null }>(
        'SELECT id, name, email FROM users',
      )
      expect(users.rows).toEqual([{ id: 1, name: 'integration', email: null }])
      const migrations = await verify.query<{ name: string }>(
        'SELECT name FROM drizzle.__drizzle_migrations ORDER BY id',
      )
      expect(migrations.rows.map(row => row.name)).toEqual([
        '20260819000000_create_users',
        '20260819000001_add_users_email',
      ])
    }
    finally {
      await verify.close()
    }
  })
})
