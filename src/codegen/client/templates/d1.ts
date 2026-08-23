import type { SourceImports } from './helpers'
import { requestBindingHelpers, sourceHeader, USE_REQUEST_IMPORT } from './helpers'

/**
 * D1 bindings only exist inside request context, so the database is resolved
 * per request and cached on the request context.
 */
export function d1Source(imports: SourceImports): string {
  return `${sourceHeader({ ...imports, extras: [USE_REQUEST_IMPORT] })}

${requestBindingHelpers()}

export function useDrizzle() {
  const request = useRequestContext('DB')
  const binding = requireBinding(request.runtime.cloudflare.env.DB, 'DB')
  request.context.__nitroDrizzleD1Db ??= drizzle(binding, { schema, relations })
  return { db: request.context.__nitroDrizzleD1Db, schema, relations }
}
`
}
