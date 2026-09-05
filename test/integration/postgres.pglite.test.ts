import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'
import { createDrizzleClient } from '../../src/database/client'
import { applyFixtureMigrations, fixtureMigrationNames } from './fixtures'

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

    // When migrations are applied twice through drizzle-orm's own migrator
    await applyFixtureMigrations(config, 'postgresql')
    await applyFixtureMigrations(config, 'postgresql')

    // Then a write through the generated client executor lands in the database
    // and every migration is recorded exactly once
    const client = await createDrizzleClient(config)
    await client.execute(`INSERT INTO counts (id, title) VALUES ('driver-row', 'integration')`)
    await client.close()

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
