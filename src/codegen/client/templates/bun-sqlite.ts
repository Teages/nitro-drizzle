import type { DevClientConnection, SourceImports } from './helpers'
import { lazyUseDrizzleSource, quote, USE_RUNTIME_CONFIG_IMPORT } from './helpers'

export function bunSqliteSource(imports: SourceImports, dev?: DevClientConnection): string {
  if (dev !== undefined) {
    return lazyUseDrizzleSource(imports, `  return drizzle({
    connection: ${quote(dev.connection ?? ':memory:')},
    schema,
    relations,
  })`)
  }
  return lazyUseDrizzleSource(
    { ...imports, extras: [USE_RUNTIME_CONFIG_IMPORT] },
    `  const connection = useRuntimeConfig().drizzle?.connection ?? {}
  return drizzle({
    connection: connection.url || connection.connectionString || connection,
    schema,
    relations,
  })`,
  )
}
