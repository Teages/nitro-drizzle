import type { SourceImports } from './helpers'
import { lazyUseDrizzleSource, USE_CONNECTION_IMPORT } from './helpers'

export function neonHttpSource(imports: SourceImports): string {
  return lazyUseDrizzleSource(
    { ...imports, extras: [USE_CONNECTION_IMPORT] },
    `  const connection = useDrizzleConnection()
  return drizzle({
    connection: connection.url || connection.connectionString,
    schema,
    relations,
  })`,
  )
}
