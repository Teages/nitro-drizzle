import type { DevClientConnection, SourceImports } from './helpers'
import { connectionAwareSource, lazyUseDrizzleSource, quote } from './helpers'

/**
 * Shared source shape for the file-backed sqlite drivers
 * (better-sqlite3 / bun-sqlite / node-sqlite): all three take a plain
 * connection string or in-memory default.
 */
export function sqliteFileSource(imports: SourceImports, dev?: DevClientConnection): string {
  return connectionAwareSource(imports, dev, {
    dev: (imports, dev) =>
      lazyUseDrizzleSource(imports, `  return drizzle({
    connection: ${quote(dev.connection ?? ':memory:')},
    schema,
    relations,
  })`),
    runtime: imports =>
      lazyUseDrizzleSource(imports, `  const connection = useDrizzleConnection()
  return drizzle({
    connection: connection.url || connection.connectionString || connection,
    schema,
    relations,
  })`),
  })
}
