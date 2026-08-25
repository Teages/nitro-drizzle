import type { StudioExecutor } from '../../../src/runtime/studio/adapters'
import { Buffer } from 'node:buffer'
import { drizzle as betterSqlite3Drizzle } from 'drizzle-orm/better-sqlite3'
import { drizzle as libsqlDrizzle } from 'drizzle-orm/libsql'
import { drizzle as nodeSqliteDrizzle } from 'drizzle-orm/node-sqlite'
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite'
import { describe, expect, it } from 'vitest'
import { createStudioExecutor } from '../../../src/runtime/studio/adapters'

async function seedUsers(executor: StudioExecutor): Promise<void> {
  await executor.query({
    sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)',
    method: 'run',
  })
  await executor.query({
    sql: 'INSERT INTO users (id, name) VALUES (?, ?)',
    params: [1, 'alice'],
    method: 'run',
  })
  await executor.query({
    sql: 'INSERT INTO users (id, name) VALUES (?, ?)',
    params: [2, 'bob'],
    method: 'run',
  })
}

async function seedPgUsers(executor: StudioExecutor): Promise<void> {
  await executor.query({
    sql: 'CREATE TABLE users (id serial PRIMARY KEY, name text NOT NULL)',
    method: 'run',
  })
  await executor.query({
    sql: 'INSERT INTO users (name) VALUES ($1), ($2)',
    params: ['alice', 'bob'],
    method: 'run',
  })
}

describe.each([
  ['better-sqlite3', () => betterSqlite3Drizzle({ connection: ':memory:' })],
  ['node-sqlite', () => nodeSqliteDrizzle({ connection: ':memory:' })],
  ['libsql', () => libsqlDrizzle({ connection: ':memory:' })],
] as const)('sqlite studio executor (%s)', (engine, createDb) => {
  it('runs queries, reads rows in both modes, and shares params', async () => {
    // Given
    const executor = createStudioExecutor(engine, createDb())
    await seedUsers(executor)

    // When
    const rows = await executor.query({ sql: 'SELECT id, name FROM users ORDER BY id', method: 'all' })
    const arrays = await executor.query({ sql: 'SELECT id, name FROM users ORDER BY id', method: 'values', mode: 'array' })
    const named = await executor.query({
      sql: 'SELECT name FROM users WHERE id = ?',
      params: [2],
      method: 'get',
    })

    // Then — object mode returns the frontend's full row array
    expect(rows).toEqual([
      { id: 1, name: 'alice' },
      { id: 2, name: 'bob' },
    ])
    expect(arrays).toEqual([[1, 'alice'], [2, 'bob']])
    expect(named).toEqual([{ name: 'bob' }])
  })

  it('commits transactions and reports failures inside the results', async () => {
    // Given
    const executor = createStudioExecutor(engine, createDb())
    await seedUsers(executor)

    // When — the frontend tags every statement with its query method
    const committed = await executor.transaction([
      { sql: 'UPDATE users SET name = \'carol\' WHERE id = 1', method: 'run' },
      { sql: 'SELECT name FROM users WHERE id = 1', method: 'all' },
    ])
    const afterCommit = await executor.query({ sql: 'SELECT name FROM users WHERE id = 1', method: 'all' })
    const rolled = await executor.transaction([
      { sql: 'UPDATE users SET name = \'dave\' WHERE id = 2', method: 'run' },
      { sql: 'INSERT INTO users (id, name) VALUES (1, \'collision\')', method: 'run' },
    ])
    const afterRollback = await executor.query({ sql: 'SELECT name FROM users WHERE id = 2', method: 'all' })

    // Then
    expect(committed.at(-1)).toEqual([{ name: 'carol' }])
    expect(afterCommit).toEqual([{ name: 'carol' }])
    expect(rolled.at(-1)).toBeInstanceOf(Error)
    expect(afterRollback).toEqual([{ name: 'bob' }])
  })

  it('converts binary params to buffers', async () => {
    // Given
    const executor = createStudioExecutor(engine, createDb())
    await executor.query({
      sql: 'CREATE TABLE blobs (id INTEGER PRIMARY KEY, data BLOB)',
      method: 'run',
    })

    // When
    await executor.query({
      sql: 'INSERT INTO blobs (id, data) VALUES (?, ?)',
      params: [1, { type: 'binary', value: 'aGVsbG8=' }],
      method: 'run',
    })
    const rows = await executor.query({ sql: 'SELECT data FROM blobs WHERE id = 1', method: 'all' })

    // Then — engines surface blobs as Buffer, Uint8Array or ArrayBuffer
    const data = (rows as Array<{ data: unknown }>)[0].data
    expect(Buffer.from(data as Uint8Array).toString()).toBe('aGVsbG8=')
  })

  it('preserves duplicate column names in array mode', async () => {
    // Given — object rows collapse same-named columns, so array mode must use
    // each engine's native array rows rather than Object.values()
    const executor = createStudioExecutor(engine, createDb())

    // When
    const rows = await executor.query({ sql: 'SELECT 1 AS x, 2 AS x', method: 'values', mode: 'array' })

    // Then
    expect(rows).toEqual([[1, 2]])
  })
})

describe('pglite studio executor', () => {
  it('runs queries with row modes, params, and transactions', async () => {
    // Given — the in-memory pglite instance is shared with the app client
    const executor = createStudioExecutor('pglite', pgliteDrizzle())
    await seedPgUsers(executor)

    // When
    const rows = await executor.query({ sql: 'SELECT id, name FROM users ORDER BY id', method: 'all' })
    const arrays = await executor.query({ sql: 'SELECT id, name FROM users ORDER BY id', method: 'values', mode: 'array' })
    const committed = await executor.transaction([
      { sql: 'SELECT count(*)::int AS total FROM users' },
    ])

    // Then
    expect(rows).toEqual([
      { id: 1, name: 'alice' },
      { id: 2, name: 'bob' },
    ])
    expect(arrays).toEqual([[1, 'alice'], [2, 'bob']])
    expect(committed).toEqual([[{ total: 2 }]])
  })

  it('keeps date columns as raw strings instead of re-serialized Dates', async () => {
    // Given
    const executor = createStudioExecutor('pglite', pgliteDrizzle())
    await executor.query({ sql: 'CREATE TABLE events (at timestamp)', method: 'run' })
    await executor.query({
      sql: 'INSERT INTO events (at) VALUES ($1)',
      params: ['2026-08-25 12:00:00'],
      method: 'run',
    })

    // When
    const rows = await executor.query({ sql: 'SELECT at FROM events', method: 'all' })

    // Then
    expect(rows).toEqual([{ at: '2026-08-25 12:00:00' }])
  })
})

describe('createStudioExecutor', () => {
  it('fails fast when the engine is not a dev-database engine', () => {
    expect(() => createStudioExecutor('pglite', { $client: undefined }))
      .toThrow('does not expose $client')
    expect(() => createStudioExecutor('mysql2' as never, { $client: {} }))
      .toThrow('Unsupported studio engine')
  })
})
