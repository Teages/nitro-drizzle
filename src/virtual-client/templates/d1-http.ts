import type { SourceImports } from './helpers'
import { lazyClientSource, USE_CONNECTION_IMPORT } from './helpers'

/**
 * d1-http talks to the Cloudflare API over HTTP, so credentials come from
 * runtime config and are validated on first use instead of module load.
 *
 * drizzle v1 rc.5 replaced the sqlite-proxy callback with an executor object
 * (`all`/`get`/`run`) that receives an explicit `rowMode`. The D1 raw
 * endpoint answers with positional rows plus a separate `columns` list, so
 * object mode zips the two back into row records.
 */
export function d1HttpSource(imports: SourceImports): string {
  return lazyClientSource(
    { ...imports, extras: [USE_CONNECTION_IMPORT] },
    `  const { accountId, apiToken, databaseId } = useDrizzleConnection()
  if (!accountId || !apiToken || !databaseId) {
    throw new Error('d1-http requires connection.accountId, apiToken, and databaseId.')
  }
  const endpoint = \`https://api.cloudflare.com/client/v4/accounts/\${encodeURIComponent(accountId)}/d1/database/\${encodeURIComponent(databaseId)}/raw\`

  class D1HttpQueryError extends Error {
    constructor(payload) {
      super(\`Cloudflare D1 HTTP query failed: \${JSON.stringify(payload)}\`)
      this.name = 'D1HttpQueryError'
    }
  }

  async function d1Http(query, params) {
    const response = await globalThis.fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: \`Bearer \${apiToken}\`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: query, params }),
      signal: AbortSignal.timeout(30000),
    })
    const payload = await response.json()
    const result = payload?.result?.[0]
    if (!response.ok || payload?.success !== true || result?.success !== true) {
      throw new D1HttpQueryError(payload)
    }
    return {
      columns: result.results?.columns ?? [],
      rows: result.results?.rows ?? [],
    }
  }

  function asRowMode(columns, rows, rowMode) {
    if (rowMode !== 'object') return rows
    return rows.map(row => Object.fromEntries(columns.map((column, index) => [column, row[index]])))
  }

  return drizzle({
    all: async (query, params, rowMode) => {
      const { columns, rows } = await d1Http(query, params)
      return asRowMode(columns, rows, rowMode)
    },
    get: async (query, params, rowMode) => {
      const { columns, rows } = await d1Http(query, params)
      return asRowMode(columns, rows, rowMode)[0]
    },
    run: async (query, params) => {
      return await d1Http(query, params)
    },
  }, { relations })`,
  )
}
