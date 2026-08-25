// Runs under the Bun test runner, not vitest: `bun test` executes this file
// directly in-process, where `drizzle-orm/bun-sqlite` resolves to `bun:sqlite`.
// The vitest unit project excludes `*.bun.test.ts` because its workers always
// run on Node regardless of the launcher.
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { describe, expect, it } from 'vitest'
import { createStudioExecutor } from '../../../src/runtime/studio/adapters'

describe('bun-sqlite studio executor', () => {
  it('returns object rows in object mode and array rows in array mode', async () => {
    // Given
    const executor = createStudioExecutor('bun-sqlite', drizzle({ connection: ':memory:' }))
    await executor.query({ sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)', method: 'run' })
    await executor.query({ sql: 'INSERT INTO users (id, name) VALUES (?, ?)', params: [1, 'alice'], method: 'run' })
    await executor.query({ sql: 'INSERT INTO users (id, name) VALUES (?, ?)', params: [2, 'bob'], method: 'run' })

    // When — Bun's .all() (objects) and .values() (arrays) are distinct APIs
    const rows = await executor.query({ sql: 'SELECT id, name FROM users ORDER BY id', method: 'all' })
    const arrays = await executor.query({ sql: 'SELECT id, name FROM users ORDER BY id', method: 'values', mode: 'array' })

    // Then
    expect(rows).toEqual([
      { id: 1, name: 'alice' },
      { id: 2, name: 'bob' },
    ])
    expect(arrays).toEqual([[1, 'alice'], [2, 'bob']])
  })

  it('preserves duplicate column names in array mode', async () => {
    // Given
    const executor = createStudioExecutor('bun-sqlite', drizzle({ connection: ':memory:' }))

    // When
    const rows = await executor.query({ sql: 'SELECT 1 AS x, 2 AS x', method: 'values', mode: 'array' })

    // Then
    expect(rows).toEqual([[1, 2]])
  })
})
