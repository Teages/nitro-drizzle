import { sql } from 'drizzle-orm'
import { drizzle as libsqlDrizzle } from 'drizzle-orm/libsql'
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite'
import { integer as sqliteInteger, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'
import { pushDevSchema } from '../../src/runtime/dev-database'

const sqliteUsers = sqliteTable('users', {
  id: sqliteInteger('id').primaryKey(),
  name: sqliteText('name').notNull(),
})

const pgUsers = pgTable('users', {
  id: pgInteger('id').primaryKey(),
  name: pgText('name').notNull(),
})

describe('dev database push (sqlite)', () => {
  it('pushes the schema onto a clean database', async () => {
    // Given
    const db = libsqlDrizzle({ connection: ':memory:' })

    // When
    const report = await pushDevSchema({
      dialect: 'sqlite',
      db,
      schema: { users: sqliteUsers },
    })

    // Then
    expect(report.statements).toBeGreaterThan(0)
    const created = await db.all(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'`,
    )
    expect(created).toHaveLength(1)
  })
})

describe('dev database push (postgresql)', () => {
  it('pushes the schema', async () => {
    // Given
    const db = pgliteDrizzle()

    // When
    const report = await pushDevSchema({
      dialect: 'postgresql',
      db,
      schema: { users: pgUsers },
    })

    // Then
    expect(report.statements).toBeGreaterThan(0)
    const created = await db.execute<{ count: number }>(
      sql`SELECT count(*) AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'`,
    )
    expect(created.rows[0]?.count).toBe(1)
  })
})
