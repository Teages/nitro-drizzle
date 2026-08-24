import type { DevClientConnection, SourceImports } from './helpers'
import { lazyUseDrizzleSource, quote, USE_CONNECTION_IMPORT } from './helpers'

export function betterSqlite3Source(imports: SourceImports, dev?: DevClientConnection): string {
  if (dev !== undefined) {
    return lazyUseDrizzleSource(imports, `  return drizzle({
    connection: ${quote(dev.connection ?? ':memory:')},
    schema,
    relations,
  })`)
  }
  return lazyUseDrizzleSource(
    { ...imports, extras: [USE_CONNECTION_IMPORT] },
    `  const connection = useDrizzleConnection()
  return drizzle({
    connection: connection.url || connection.connectionString || connection,
    schema,
    relations,
  })`,
  )
}
