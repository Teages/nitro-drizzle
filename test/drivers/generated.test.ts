import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { OpaqueDrizzleDatabase } from '../integration/generated-client'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { fixtureSchemaPath } from '../integration/fixtures'
import { loadGeneratedClient } from '../integration/generated-client'

const credentials = {
  accountId: 'account-id',
  apiToken: 'api-token',
  databaseId: 'database-id',
}

const endpoint = `https://api.cloudflare.com/client/v4/accounts/${credentials.accountId}/d1/database/${credentials.databaseId}/raw`

/** The sqlite-proxy database methods the d1-http tests drive. */
interface ProxyDatabase {
  readonly run: (query: unknown) => Promise<unknown>
  readonly get: (query: unknown) => Promise<unknown>
}

function d1Response(rows: readonly unknown[]): Response {
  return Response.json({
    success: true,
    result: [{ success: true, results: { rows } }],
  })
}

interface FetchRecord {
  input: unknown
  init: RequestInit | undefined
}

interface FetchStub {
  (input: unknown, init?: RequestInit): Promise<Response>
  readonly calls: readonly FetchRecord[]
}

/** Stubs globalThis.fetch with a canned response, recording every call. */
function stubFetch(response: () => Response): FetchStub {
  const calls: FetchRecord[] = []
  const stub = async (input: unknown, init?: RequestInit): Promise<Response> => {
    calls.push({ input, init })
    return response()
  }
  return Object.assign(stub, { calls })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('generated client construction errors', () => {
  it('returns an actionable binding-only error for D1 outside request context', async () => {
    // Given the production d1 client with no Cloudflare request context
    const client = await loadGeneratedClient({
      config: { dialect: 'sqlite', driver: 'd1' },
      schemaPath: fixtureSchemaPath('sqlite'),
    })

    // When
    const call = (): unknown => client.useDrizzle()

    // Then
    expect(call).toThrow('Nitro Drizzle requires the DB Cloudflare binding in request context.')
    expect(call).toThrow(expect.objectContaining({ name: 'NitroDrizzleBindingError' }))
    await client.dispose()
  })

  it('returns an actionable binding-only error for Hyperdrive postgres-js', async () => {
    // Given the hyperdrive variant, which only constructs from a binding
    const client = await loadGeneratedClient({
      config: {
        dialect: 'postgresql',
        driver: 'postgres-js',
        connection: { hyperdriveId: 'hyperdrive-id' },
      },
      schemaPath: fixtureSchemaPath('postgresql'),
    })

    // When
    const call = (): unknown => client.useDrizzle()

    // Then
    expect(call).toThrow('Nitro Drizzle requires the POSTGRES Cloudflare binding in request context.')
    await client.dispose()
  })

  it('returns an actionable binding-only error for Hyperdrive mysql2', async () => {
    // Given the hyperdrive variant, which only constructs from a binding
    const client = await loadGeneratedClient({
      config: {
        dialect: 'mysql',
        driver: 'mysql2',
        connection: { hyperdriveId: 'hyperdrive-id' },
      },
      schemaPath: fixtureSchemaPath('mysql'),
    })

    // When
    const call = (): unknown => client.useDrizzle()

    // Then
    expect(call).toThrow('Nitro Drizzle requires the MYSQL Cloudflare binding in request context.')
    await client.dispose()
  })

  it('requires explicit D1 HTTP credentials on first use', async () => {
    // Given the d1-http client without credentials
    const client = await loadGeneratedClient({
      config: { dialect: 'sqlite', driver: 'd1-http', connection: { databaseId: 'database-id' } },
      schemaPath: fixtureSchemaPath('sqlite'),
    })

    // When
    const call = (): unknown => client.useDrizzle()

    // Then — validation happens on first use, not at module load
    expect(call).toThrow('d1-http requires connection.accountId, apiToken, and databaseId.')
    await client.dispose()
  })
})

describe('generated d1-http client', () => {
  it('queries the Cloudflare HTTP API and returns the first row for get', async () => {
    // Given the d1-http client with valid credentials and a stubbed API
    const client = await loadGeneratedClient({
      config: { dialect: 'sqlite', driver: 'd1-http', connection: credentials },
      schemaPath: fixtureSchemaPath('sqlite'),
    })
    const fetchStub = stubFetch(() => d1Response([{ id: 'driver-row', title: 'integration' }]))
    vi.stubGlobal('fetch', fetchStub)
    const { db } = client.useDrizzle()

    // When
    const row = await (db as unknown as ProxyDatabase).get(sql.raw('SELECT id, title FROM counts'))

    // Then — the query reached the per-account, per-database raw endpoint
    expect(fetchStub.calls).toHaveLength(1)
    expect(fetchStub.calls[0].input).toBe(endpoint)
    expect(fetchStub.calls[0].init?.headers).toMatchObject({
      'Authorization': `Bearer ${credentials.apiToken}`,
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(fetchStub.calls[0].init?.body))).toEqual({
      sql: 'SELECT id, title FROM counts',
      params: [],
    })
    expect(row).toEqual({ id: 'driver-row', title: 'integration' })
    await client.dispose()
  })

  it('raises a D1HttpQueryError for a failed API call', async () => {
    // Given the d1-http client and an error payload from the API
    const client = await loadGeneratedClient({
      config: { dialect: 'sqlite', driver: 'd1-http', connection: credentials },
      schemaPath: fixtureSchemaPath('sqlite'),
    })
    vi.stubGlobal('fetch', async () => Response.json({ success: false, errors: [{ code: 7003 }] }))
    const { db } = client.useDrizzle()

    // When
    const query = (db as unknown as ProxyDatabase).run(sql.raw('INSERT INTO counts VALUES (\'x\')'))

    // Then — drizzle wraps the transport error; the generated error with
    // its payload rides the cause chain
    const error = await query.then(
      () => { throw new Error('expected the query to reject') },
      thrown => thrown,
    ) as { name?: string, cause?: { name?: string, message?: string } }
    expect(error.name).toBe('DrizzleQueryError')
    expect(error.cause).toMatchObject({ name: 'D1HttpQueryError' })
    expect(error.cause?.message).toContain('Cloudflare D1 HTTP query failed')
    await client.dispose()
  })
})

describe('opaqueDrizzleDatabase', () => {
  it('accepts a real LibSQL database', () => {
    expectTypeOf<LibSQLDatabase>().toExtend<OpaqueDrizzleDatabase>()
  })

  it('accepts a real postgres-js database', () => {
    expectTypeOf<PostgresJsDatabase>().toExtend<OpaqueDrizzleDatabase>()
  })
})
