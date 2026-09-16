import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'
import { applyFixtureMigrations, fixtureMigrationNames, fixtureSchemaPath } from './fixtures'
import { loadGeneratedClient } from './generated-client'

describe('pglite driver integration', () => {
  it('applies the fixture migrations, stays idempotent, and smoke-checks queries', async () => {
    // Given the base fixture's PostgreSQL migrations and a directory-backed PGlite database
    const dataDir = join(
      await mkdtemp(join(tmpdir(), 'nitro-drizzle-pglite-')),
      'pgdata',
    )
    const config = {
      dialect: 'postgresql',
      driver: 'pglite',
      connection: { dataDir },
    } as const
    const migrations = await fixtureMigrationNames('postgresql')
    const client = await loadGeneratedClient({
      config,
      schemaPath: fixtureSchemaPath('postgresql'),
    })
    try {
      // When migrations are applied twice through drizzle-orm's own migrator
      await applyFixtureMigrations(client.useDrizzle().db, 'pglite', 'postgresql')
      await applyFixtureMigrations(client.useDrizzle().db, 'pglite', 'postgresql')

      // Then a write through the generated client lands in the database
      // and every migration is recorded exactly once
      await client.execute(`INSERT INTO counts (id, title) VALUES ('driver-row', 'integration')`)
    }
    finally {
      await client.close()
      await client.dispose()
    }

    const verify = new PGlite(dataDir)
    try {
      const counts = await verify.query<{ id: string, title: string }>(
        'SELECT id, title FROM counts',
      )
      expect(counts.rows).toEqual([{ id: 'driver-row', title: 'integration' }])
      const applied = await verify.query<{ name: string }>(
        'SELECT name FROM drizzle.__drizzle_migrations ORDER BY id',
      )
      expect(applied.rows.map(row => row.name)).toEqual(migrations)
    }
    finally {
      await verify.close()
    }
  })
})
