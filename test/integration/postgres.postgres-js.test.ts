import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyFixtureMigrations, fixtureMigrationNames, fixtureSchemaPath } from './fixtures'
import { loadGeneratedClient } from './generated-client'

describe('postgres-js driver integration', () => {
  // A real PostgreSQL wire server backed by an in-process PGlite instance,
  // so postgres-js connects over TCP without any external service.
  let pglite: PGlite
  let server: PGLiteSocketServer
  let port: number

  beforeAll(async () => {
    pglite = new PGlite()
    server = new PGLiteSocketServer({ db: pglite, port: 0, maxConnections: 20 })
    await server.start()
    port = Number(server.getServerConn().split(':').at(-1))
  })

  afterAll(async () => {
    await server.stop()
    await pglite.close()
  })

  it('applies the fixture migrations, stays idempotent, and smoke-checks queries', async () => {
    // Given the base fixture's PostgreSQL migrations and a TCP endpoint
    const config = {
      dialect: 'postgresql',
      driver: 'postgres-js',
      connection: { url: `postgres://postgres@127.0.0.1:${port}/postgres` },
    } as const
    const migrations = await fixtureMigrationNames('postgresql')
    const client = await loadGeneratedClient({
      config,
      schemaPath: fixtureSchemaPath('postgresql'),
    })
    try {
      // When migrations are applied twice through drizzle-orm's own migrator
      await applyFixtureMigrations(client.useDrizzle().db, 'postgres-js', 'postgresql')
      await applyFixtureMigrations(client.useDrizzle().db, 'postgres-js', 'postgresql')

      // Then a write through the generated client lands in the database
      // and every migration is recorded exactly once
      await client.execute(`INSERT INTO counts (id, title) VALUES ('driver-row', 'integration')`)
    }
    finally {
      await client.close()
      await client.dispose()
    }

    const verify = postgres(`postgres://postgres@127.0.0.1:${port}/postgres`)
    try {
      const counts = await verify<{ id: string, title: string }[]>`
        SELECT id, title FROM counts
      `
      expect(counts).toEqual([{ id: 'driver-row', title: 'integration' }])
      const applied = await verify<{ name: string }[]>`
        SELECT name FROM drizzle.__drizzle_migrations ORDER BY id
      `
      expect(applied.map(row => row.name)).toEqual(migrations)
    }
    finally {
      await verify.end()
    }
  })
})
