import type { DevClientConnection, SourceImports } from './helpers'
import { lazyUseDrizzleSource, quote, USE_CONNECTION_IMPORT } from './helpers'

export function libsqlSource(imports: SourceImports, dev?: DevClientConnection): string {
  if (dev !== undefined) {
    return lazyUseDrizzleSource(imports, `  return drizzle({
    connection: { url: ${quote(dev.connection ?? ':memory:')} },
    schema,
    relations,
  })`)
  }
  return lazyUseDrizzleSource(
    { ...imports, extras: [USE_CONNECTION_IMPORT] },
    `  const connection = useDrizzleConnection()
  return drizzle({
    connection: {
      url: connection.url,
      ...(connection.authToken ? { authToken: connection.authToken } : {}),
    },
    schema,
    relations,
  })`,
  )
}
