import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDrizzleClient } from '../../src/database/client'
import { applyMigrationWorkspace, createMigrationWorkspace } from './fixtures'

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

  it('applies the migration folder, stays idempotent, and smoke-checks queries', async () => {
    // Given a TCP PostgreSQL endpoint and a v1 migration folder
    const { migrationsFolder } = await createMigrationWorkspace('postgres-js', 'postgresql')
    const config = {
      dialect: 'postgresql',
      driver: 'postgres-js',
      connection: { url: `postgres://postgres@127.0.0.1:${port}/postgres` },
    } as const

    // When migrations are applied twice through the fixture helper
    const apply = () => applyMigrationWorkspace(config, migrationsFolder)
    await expect(apply()).resolves.toEqual({ ok: true })
    await expect(apply()).resolves.toEqual({ ok: true })

    // Then a write through the generated client executor lands in the database
    const client = await createDrizzleClient(config)
    await client.execute(`INSERT INTO users (name) VALUES ('integration')`)
    await client.close()

    const verify = postgres(`postgres://postgres@127.0.0.1:${port}/postgres`)
    try {
      const users = await verify<{ id: number, name: string, email: string | null }[]>`
        SELECT id, name, email FROM users
      `
      expect(users).toEqual([{ id: 1, name: 'integration', email: null }])
      const migrations = await verify<{ name: string }[]>`
        SELECT name FROM drizzle.__drizzle_migrations ORDER BY id
      `
      expect(migrations.map(row => row.name)).toEqual([
        '20260819000000_create_users',
        '20260819000001_add_users_email',
      ])
    }
    finally {
      await verify.end()
    }
  })
})
