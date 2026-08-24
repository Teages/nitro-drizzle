import type { SourceImports } from './helpers'
import {
  lazyUseDrizzleSource,
  requestBindingHelpers,
  sourceHeader,
  USE_CONNECTION_IMPORT,
  USE_REQUEST_IMPORT,
} from './helpers'

export type Mysql2Variant = 'standard' | 'hyperdrive'

export interface Mysql2SourceOptions {
  readonly imports: SourceImports
  readonly variant: Mysql2Variant
}

const CONNECTION_OPTIONS_DESTRUCTURE = `const { url, connectionString, hyperdriveId, ...options } = useDrizzleConnection()
  const clientOptions = Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== '' && value !== 0 && value !== undefined),
  )`

export function mysql2Source(options: Mysql2SourceOptions): string {
  switch (options.variant) {
    case 'hyperdrive':
      return `${sourceHeader({
        ...options.imports,
        extras: [USE_REQUEST_IMPORT],
      })}

${requestBindingHelpers()}

function createDb(binding) {
  return drizzle({ connection: binding.connectionString, schema, relations })
}

export function useDrizzle() {
  const request = useRequestContext('MYSQL')
  const binding = requireBinding(request.runtime.cloudflare.env.MYSQL, 'MYSQL')
  request.context.__nitroDrizzleMysqlDb ??= createDb(binding)
  return { db: request.context.__nitroDrizzleMysqlDb, schema, relations }
}
`
    default:
      return lazyUseDrizzleSource(
        { ...options.imports, extras: [USE_CONNECTION_IMPORT] },
        `  ${CONNECTION_OPTIONS_DESTRUCTURE}
  return drizzle({
    connection: url || connectionString || clientOptions,
    schema,
    relations,
  })`,
      )
  }
}
