import type { SourceImports } from './helpers'
import { lazyUseDrizzleSource, USE_RUNTIME_CONFIG_IMPORT } from './helpers'

/**
 * d1-http talks to the Cloudflare API over HTTP, so credentials come from
 * runtime config and are validated on first use instead of module load.
 */
export function d1HttpSource(imports: SourceImports): string {
  return lazyUseDrizzleSource(
    { ...imports, extras: [USE_RUNTIME_CONFIG_IMPORT] },
    `  const { accountId, apiToken, databaseId } = useRuntimeConfig().drizzle?.connection ?? {}
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

  async function d1Http(sql, params, method) {
    const response = await globalThis.fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: \`Bearer \${apiToken}\`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(30000),
    })
    const payload = await response.json()
    const result = payload?.result?.[0]
    if (!response.ok || payload?.success !== true || result?.success !== true) {
      throw new D1HttpQueryError(payload)
    }
    const rows = result.results?.rows ?? []
    return { rows: method === 'get' ? rows[0] : rows }
  }

  return drizzle(d1Http, { schema, relations })`,
  )
}
