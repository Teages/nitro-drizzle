import type { DevClientConnection, SourceImports } from './helpers'
import { lazyUseDrizzleSource, quote, USE_CONNECTION_IMPORT } from './helpers'

export function pgliteSource(imports: SourceImports, dev?: DevClientConnection): string {
  if (dev !== undefined) {
    // An absent connection constructs PGlite without a data directory: in-memory.
    return lazyUseDrizzleSource(imports, `  return drizzle({
${dev.connection === undefined
  ? ''
  : `    connection: ${quote(dev.connection)},
`}    schema,
    relations,
  })`)
  }
  return lazyUseDrizzleSource(
    { ...imports, extras: [USE_CONNECTION_IMPORT] },
    `  const connection = useDrizzleConnection()
  return drizzle({
    connection: connection.dataDir || connection.url || connection.connectionString,
    schema,
    relations,
  })`,
  )
}
