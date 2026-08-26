import type { DevClientConnection, SourceImports } from './helpers'
import { connectionAwareSource, lazyUseDrizzleSource, quote } from './helpers'

export function pgliteSource(imports: SourceImports, dev?: DevClientConnection): string {
  return connectionAwareSource(imports, dev, {
    dev: (imports, dev) => {
      // An absent connection constructs PGlite without a data directory: in-memory.
      return lazyUseDrizzleSource(imports, `  return drizzle({
${dev.connection === undefined
  ? ''
  : `    connection: ${quote(dev.connection)},
`}    schema,
    relations,
  })`)
    },
    runtime: imports =>
      lazyUseDrizzleSource(imports, `  const connection = useDrizzleConnection()
  return drizzle({
    connection: connection.dataDir || connection.url || connection.connectionString,
    schema,
    relations,
  })`),
  })
}
