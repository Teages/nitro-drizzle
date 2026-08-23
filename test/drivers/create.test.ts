import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { OpaqueDrizzleDatabase } from '../../src/drivers/database'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { createDrizzleClient, createDrizzleClientFromDatabase } from '../../src/drivers/create'
import { createCloser, createExecutor } from '../../src/drivers/database'
import { DrizzleClientError } from '../../src/drivers/errors'

describe('createDrizzleClient', () => {
  it('returns an actionable binding-only error for D1', async () => {
    // Given
    const config = {
      dialect: 'sqlite',
      driver: 'd1',
      connection: { databaseId: 'database-id' },
    } as const

    // When
    const result = createDrizzleClient(config)

    // Then
    await expect(result).rejects.toMatchObject({
      name: DrizzleClientError.name,
      code: 'binding_only',
      driver: 'd1',
    })
    await expect(result).rejects.toThrow('Wrangler CLI')
  })

  it('requires explicit D1 HTTP credentials', async () => {
    // Given
    const config = {
      dialect: 'sqlite',
      driver: 'd1-http',
      connection: { databaseId: 'database-id' },
    } as const

    // When
    const result = createDrizzleClient(config)

    // Then
    await expect(result).rejects.toMatchObject({
      name: DrizzleClientError.name,
      code: 'invalid_connection',
      driver: 'd1-http',
    })
    await expect(result).rejects.toThrow('accountId')
  })

  it('returns an actionable binding-only error for Hyperdrive', async () => {
    // Given
    const config = {
      dialect: 'postgresql',
      driver: 'postgres-js',
      connection: { hyperdriveId: 'hyperdrive-id' },
    } as const

    // When
    const result = createDrizzleClient(config)

    // Then
    await expect(result).rejects.toMatchObject({
      name: DrizzleClientError.name,
      code: 'binding_only',
      driver: 'postgres-js',
    })
    await expect(result).rejects.toThrow('request context')
  })

  it('uses a non-empty connection string when the URL placeholder is empty', async () => {
    const client = await createDrizzleClient({
      dialect: 'sqlite',
      driver: 'libsql',
      connection: {
        url: '',
        connectionString: 'file::memory:',
      },
    })

    await expect(client.execute('SELECT 1;')).resolves.toBeUndefined()
    await client.close()
  })

  it('wraps an injected binding database for runtime migrations', async () => {
    // Given
    const queries: unknown[] = []
    const database = {
      run(query: unknown): void {
        queries.push(query)
      },
    }

    // When
    const client = createDrizzleClientFromDatabase({
      dialect: 'sqlite',
      driver: 'd1',
      database,
    })
    await client.execute('SELECT 1;')
    await client.close()

    // Then
    expect(client.db).toBe(database)
    expect(queries).toHaveLength(1)
  })
})

describe('createCloser', () => {
  it('calls $client.end when it exists', async () => {
    // Given
    const calls: string[] = []
    const closer = createCloser({
      $client: {
        end: () => {
          calls.push('end')
        },
        close: () => {
          calls.push('close')
        },
      },
    })

    // When
    await closer()

    // Then
    expect(calls).toEqual(['end'])
  })

  it('falls back to $client.close when end is absent', async () => {
    // Given
    const calls: string[] = []
    const closer = createCloser({
      $client: {
        close: () => {
          calls.push('close')
        },
        destroy: () => {
          calls.push('destroy')
        },
      },
    })

    // When
    await closer()

    // Then
    expect(calls).toEqual(['close'])
  })

  it('falls back to $client.destroy when end and close are absent', async () => {
    // Given
    const calls: string[] = []
    const closer = createCloser({
      $client: {
        destroy: () => {
          calls.push('destroy')
        },
      },
    })

    // When
    await closer()

    // Then
    expect(calls).toEqual(['destroy'])
  })

  it('is a no-op when $client has no close method', async () => {
    // Given
    const closer = createCloser({})

    // When
    const result = closer()

    // Then
    await expect(result).resolves.toBeUndefined()
  })
})

describe('createExecutor', () => {
  it('accepts a real LibSQL database as OpaqueDrizzleDatabase', () => {
    expectTypeOf<LibSQLDatabase>().toExtend<OpaqueDrizzleDatabase>()
  })

  it('accepts a real postgres-js database as OpaqueDrizzleDatabase', () => {
    expectTypeOf<PostgresJsDatabase>().toExtend<OpaqueDrizzleDatabase>()
  })

  it('calls run on a sqlite database without extra shape checks', async () => {
    // Given
    const queries: unknown[] = []
    const execute = createExecutor({
      run: (query: unknown) => {
        queries.push(query)
      },
    }, 'sqlite')

    // When
    await execute('SELECT 1;')

    // Then
    expect(queries).toHaveLength(1)
  })

  it('throws when the dialect method is missing', () => {
    // Given
    const database = {}

    // When
    const create = (): ReturnType<typeof createExecutor> => createExecutor(database, 'sqlite')

    // Then
    expect(create).toThrow(TypeError)
    expect(create).toThrow('run()')
  })

  it('calls execute on a postgresql database without extra shape checks', async () => {
    // Given
    const queries: unknown[] = []
    const execute = createExecutor({
      execute: (query: unknown) => {
        queries.push(query)
      },
    }, 'postgresql')

    // When
    await execute('SELECT 1;')

    // Then
    expect(queries).toHaveLength(1)
  })
})
