import type { DatabaseConnection } from '../contracts/public'

export interface D1HttpCredentials {
  readonly accountId: string
  readonly apiToken: string
  readonly databaseId: string
}

export interface D1HttpRows {
  readonly rows: readonly unknown[] | undefined
}

export class D1HttpError extends Error {
  constructor(
    readonly code: 'invalid_response' | 'request_failed',
    message: string,
  ) {
    super(message)
    this.name = 'D1HttpError'
  }
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null
}

function successfulRows(value: unknown): readonly unknown[] | undefined {
  if (!isRecord(value) || value.success !== true || !isRecord(value.results)) {
    return undefined
  }
  return Array.isArray(value.results.rows) ? value.results.rows : []
}

export function resolveD1HttpCredentials(
  connection: DatabaseConnection | undefined,
): D1HttpCredentials | undefined {
  if (
    connection?.accountId === undefined
    || connection.apiToken === undefined
    || connection.databaseId === undefined
    || connection.accountId === ''
    || connection.apiToken === ''
    || connection.databaseId === ''
  ) {
    return undefined
  }
  return {
    accountId: connection.accountId,
    apiToken: connection.apiToken,
    databaseId: connection.databaseId,
  }
}

export function createD1HttpTransport(
  credentials: D1HttpCredentials,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): {
  readonly query: (
    sql: string,
    params: readonly unknown[],
    method: string,
  ) => Promise<D1HttpRows>
  readonly migrate: (queries: readonly string[]) => Promise<void>
} {
  const accountId = encodeURIComponent(credentials.accountId)
  const databaseId = encodeURIComponent(credentials.databaseId)
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/raw`

  const request = async (body: unknown): Promise<readonly (readonly unknown[])[]> => {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) {
      throw new D1HttpError(
        'request_failed',
        `Cloudflare D1 HTTP request failed with status ${response.status}.`,
      )
    }

    const payload: unknown = await response.json()
    if (!isRecord(payload) || payload.success !== true || !Array.isArray(payload.result)) {
      throw new D1HttpError(
        'invalid_response',
        'Cloudflare D1 HTTP response did not report success.',
      )
    }

    const rows: (readonly unknown[])[] = []
    for (const result of payload.result) {
      const resultRows = successfulRows(result)
      if (resultRows === undefined) {
        throw new D1HttpError(
          'invalid_response',
          'Cloudflare D1 HTTP query result did not report success.',
        )
      }
      rows.push(resultRows)
    }
    return rows
  }

  return {
    async query(sql, params, method) {
      const results = await request({ sql, params })
      const rows = results[0] ?? []
      if (method === 'get') {
        const first = rows[0]
        return { rows: Array.isArray(first) ? first : undefined }
      }
      return { rows }
    },
    async migrate(queries) {
      if (queries.length === 0) {
        return
      }
      await request(queries.map(sql => ({ sql, params: [] })))
    },
  }
}
