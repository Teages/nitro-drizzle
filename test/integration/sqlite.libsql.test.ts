import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import { createDrizzleClient } from '../../src/database/client'
import { applyFixtureMigrations, fixtureMigrationNames } from './fixtures'

describe('libsql driver integration', () => {
  it('applies the fixture migrations, stays idempotent, and smoke-checks queries', async () => {
    // Given the base fixture's SQLite migrations and a file-backed libSQL database
    const databasePath = join(
      await mkdtemp(join(tmpdir(), 'nitro-drizzle-libsql-')),
      'app.db',
    )
    const config = {
      dialect: 'sqlite',
      driver: 'libsql',
      connection: { url: `file:${databasePath}` },
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

    const verify = createClient({ url: `file:${databasePath}` })
    try {
      const counts = await verify.execute('SELECT id, title FROM counts')
      expect(counts.rows).toEqual([{ id: 'driver-row', title: 'integration' }])
      const applied = await verify.execute(
        'SELECT name FROM __drizzle_migrations ORDER BY id',
      )
      expect(applied.rows.map(row => row.name)).toEqual(migrations)
    }
    finally {
      verify.close()
    }
  })
})
