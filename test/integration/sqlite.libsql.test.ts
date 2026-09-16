import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import { applyFixtureMigrations, fixtureMigrationNames, fixtureSchemaPath } from './fixtures'
import { loadGeneratedClient } from './generated-client'

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
    const client = await loadGeneratedClient({
      config,
      schemaPath: fixtureSchemaPath('sqlite'),
    })
    try {
      // When migrations are applied twice through drizzle-orm's own migrator
      await applyFixtureMigrations(client.useDrizzle().db, 'libsql', 'sqlite')
      await applyFixtureMigrations(client.useDrizzle().db, 'libsql', 'sqlite')

      // Then a write through the generated client lands in the database
      // and every migration is recorded exactly once
      await client.execute(`INSERT INTO counts (id, title) VALUES ('driver-row', 'integration')`)
    }
    finally {
      await client.close()
      await client.dispose()
    }

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
