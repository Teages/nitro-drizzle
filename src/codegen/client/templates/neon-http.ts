import type { SourceImports } from './helpers'
import { lazyUseDrizzleSource, USE_RUNTIME_CONFIG_IMPORT } from './helpers'

export function neonHttpSource(imports: SourceImports): string {
  return lazyUseDrizzleSource(
    { ...imports, extras: [USE_RUNTIME_CONFIG_IMPORT] },
    `  const connection = useRuntimeConfig().drizzle?.connection ?? {}
  return drizzle({
    connection: connection.url || connection.connectionString,
    schema,
    relations,
  })`,
  )
}
