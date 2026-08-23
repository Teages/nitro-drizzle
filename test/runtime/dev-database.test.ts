import { sql } from 'drizzle-orm'
import { drizzle as libsqlDrizzle } from 'drizzle-orm/libsql'
import { integer, pgTable, text } from 'drizzle-orm/pg-core'
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite'
import { integer as sqliteInteger, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'
import { pushDevSchema, resetDevSchema } from '../../src/runtime/dev-database'

const sqliteUsers = sqliteTable('users', {
  id: sqliteInteger('id').primaryKey(),
  name: sqliteText('name').notNull(),
})

const pgUsers = pgTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
})

describe('dev database push and reset (sqlite)', () => {
  it('pushes the schema, resets every object, and re-pushes onto a clean database', async () => {
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

    // When — data survives a second no-op push, then reset wipes everything
    await db.run(sql`INSERT INTO users (id, name) VALUES (1, 'alice')`)
    await resetDevSchema('sqlite', db)
    const dropped = await db.all(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'`,
    )
    expect(dropped).toHaveLength(0)

    // Then — re-push recreates the schema empty
    await pushDevSchema({ dialect: 'sqlite', db, schema: { users: sqliteUsers } })
    const rows = await db.all<{ count: number }>(
      sql`SELECT count(*) AS count FROM users`,
    )
    expect(rows[0]?.count).toBe(0)
  })

  it('restores foreign keys when schema introspection fails', async () => {
    // Given
    const statements: string[] = []
    const failure = new Error('sqlite_master unavailable')
    const db = {
      run(query: { queryChunks: Array<{ value: string[] }> }) {
        statements.push(query.queryChunks[0]?.value[0] ?? '')
      },
      all() {
        throw failure
      },
    }

    // When
    const reset = resetDevSchema('sqlite', db)

    // Then
    await expect(reset).rejects.toBe(failure)
    expect(statements).toEqual([
      'PRAGMA foreign_keys = OFF;',
      'PRAGMA foreign_keys = ON;',
    ])
  })
})

describe('dev database push and reset (postgresql)', () => {
  it('pushes the schema, resets the public schema, and re-pushes', async () => {
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

    // When
    await db.execute(sql`INSERT INTO users (id, name) VALUES (1, 'alice')`)
    await resetDevSchema('postgresql', db)

    // Then — the public schema is empty but can be re-pushed
    const dropped = await db.execute<{ count: number }>(
      sql`SELECT count(*) AS count FROM information_schema.tables WHERE table_schema = 'public'`,
    )
    expect(dropped.rows[0]?.count).toBe(0)
    await pushDevSchema({ dialect: 'postgresql', db, schema: { users: pgUsers } })
    const rows = await db.execute<{ count: number }>(
      sql`SELECT count(*) AS count FROM users`,
    )
    expect(rows.rows[0]?.count).toBe(0)
  })
})
