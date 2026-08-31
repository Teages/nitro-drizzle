import type { DevClientConnection, SourceImports } from './helpers'
import { connectionAwareSource, lazyUseDrizzleSource, quote } from './helpers'

export function libsqlSource(imports: SourceImports, dev?: DevClientConnection): string {
  return connectionAwareSource(imports, dev, {
    dev: (imports, dev) =>
      lazyUseDrizzleSource(imports, `  return drizzle({
    connection: { url: ${quote(dev.connection ?? ':memory:')} },
    schema,
    relations,
  })`),
    runtime: imports =>
      lazyUseDrizzleSource(imports, `  const connection = useDrizzleConnection()
  return drizzle({
    connection: {
      url: connection.url,
      ...(connection.authToken ? { authToken: connection.authToken } : {}),
    },
    schema,
    relations,
  })`),
  })
}
