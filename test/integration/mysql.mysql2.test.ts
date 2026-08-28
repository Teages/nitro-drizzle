import type { DatabaseConnection } from '../../src/types'
import { createConnection } from 'mysql2/promise'
import { describe, expect, it } from 'vitest'
import { createDrizzleClient } from '../../src/database/client'
import { applyMigrationWorkspace, createMigrationWorkspace } from './fixtures'

// Runs only when a MySQL endpoint is provided; CI wires a service container.
// Locally: docker run -d -p 3306:3306 -e MYSQL_ROOT_PASSWORD=root
// -e MYSQL_DATABASE=nitro_drizzle mysql:8.4, then
// TEST_MYSQL_URL=mysql://root:root@127.0.0.1:3306/nitro_drizzle pnpm test:integration
function parseMySqlUrl(url: string): {
  url: string
  connection: DatabaseConnection
} {
  const parsed = new URL(url)
  return {
    url,
    connection: {
      host: parsed.hostname,
      port: Number(parsed.port) || 3306,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, ''),
    },
  }
}

const mysql = process.env.TEST_MYSQL_URL !== undefined
  ? parseMySqlUrl(process.env.TEST_MYSQL_URL)
  : undefined

describe.skipIf(mysql === undefined)('mysql2 driver integration', () => {
  // Expected to fail: drizzle-orm 1.0.0-rc.4's mysql2 driver reads
  // `client.config.supportBigNumbers` from the pool created via
  // `drizzle({ connection })`, but mysql2's PromisePool exposes no `config`
  // (https://github.com/drizzle-team/drizzle-orm/issues/5972). Passing a
  // callback-style pool as `client` works; until that lands in create.ts and
  // the mysql2 template, this stays a known-red canary.
  it.fails('applies the migration folder, stays idempotent, and smoke-checks queries', async () => {
    // Given a running MySQL server and a v1 migration folder
    const { migrationsFolder } = await createMigrationWorkspace('mysql2', 'mysql')
    const config = {
      dialect: 'mysql',
      driver: 'mysql2',
      connection: mysql!.connection,
    } as const

    // When migrations are applied twice through the fixture helper
    const apply = () => applyMigrationWorkspace(config, migrationsFolder)
    await expect(apply()).resolves.toEqual({ ok: true })
    await expect(apply()).resolves.toEqual({ ok: true })

    // Then a write through the generated client executor lands in the database
    const client = await createDrizzleClient(config)
    await client.execute(`INSERT INTO users (name) VALUES ('integration')`)
    await client.close()

    const verify = await createConnection(mysql!.url)
    try {
      const [users] = await verify.query('SELECT id, name, email FROM users')
      expect(users).toEqual([{ id: 1, name: 'integration', email: null }])
      const [migrations] = await verify.query(
        'SELECT name FROM __drizzle_migrations ORDER BY id',
      )
      expect(migrations).toEqual([
        { name: '20260819000000_create_users' },
        { name: '20260819000001_add_users_email' },
      ])
    }
    finally {
      await verify.end()
    }
  })
})
