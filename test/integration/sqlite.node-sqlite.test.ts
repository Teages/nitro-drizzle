import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { createDrizzleClient } from '../../src/database/client'
import { applyFixtureMigrations, fixtureMigrationNames } from './fixtures'

describe('node-sqlite driver integration', () => {
  it('applies the fixture migrations, stays idempotent, and smoke-checks queries', async () => {
    // Given the base fixture's SQLite migrations and a file-backed database
    const databasePath = join(
      await mkdtemp(join(tmpdir(), 'nitro-drizzle-node-sqlite-')),
      'app.db',
    )
    const config = {
      dialect: 'sqlite',
      driver: 'node-sqlite',
      connection: { url: databasePath },
    } as const
    const migrations = await fixtureMigrationNames('sqlite')

    // When migrations are applied twice through drizzle-orm's own migrator
    await applyFixtureMigrations(config, 'sqlite')
    await applyFixtureMigrations(config, 'sqlite')

    // Then a write through the generated client executor lands in the database
    // and every migration is recorded exactly once
    const client = await createDrizzleClient(config)
    await client.execute(`INSERT INTO counts (id, title) VALUES ('driver-row', 'integration')`)
    await client.close()

    const verify = new DatabaseSync(databasePath)
    try {
      expect(verify.prepare('SELECT id, title FROM counts').all()).toEqual([
        { id: 'driver-row', title: 'integration' },
      ])
      expect(
        verify.prepare('SELECT name FROM __drizzle_migrations ORDER BY id').all(),
      ).toEqual(migrations.map(name => ({ name })))
    }
    finally {
      verify.close()
    }
  })
})
