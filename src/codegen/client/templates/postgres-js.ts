import type { SourceImports } from './helpers'
import {
  lazyUseDrizzleSource,
  requestBindingHelpers,
  sourceHeader,
  USE_REQUEST_IMPORT,
  USE_RUNTIME_CONFIG_IMPORT,
} from './helpers'

export type PostgresJsVariant = 'standard' | 'hyperdrive'

export interface PostgresJsSourceOptions {
  readonly imports: SourceImports
  readonly variant: PostgresJsVariant
}

const CONNECTION_OPTIONS_DESTRUCTURE = `const drizzleConfig = useRuntimeConfig().drizzle ?? {}
  const { url, connectionString, hyperdriveId, ...extras } = drizzleConfig.connection ?? {}
  const options = Object.fromEntries(
    Object.entries(extras).filter(([, value]) => value !== '' && value !== 0 && value !== undefined),
  )`

export function postgresJsSource(options: PostgresJsSourceOptions): string {
  switch (options.variant) {
    case 'hyperdrive':
      return `${sourceHeader({
        ...options.imports,
        extras: [
          `import postgres from 'postgres'`,
          USE_REQUEST_IMPORT,
          USE_RUNTIME_CONFIG_IMPORT,
        ],
      })}

${requestBindingHelpers()}

function createDb(binding) {
  ${CONNECTION_OPTIONS_DESTRUCTURE}
  return drizzle({
    client: postgres(binding.connectionString, { ...options, prepare: options.prepare ?? false }),
    schema,
    relations,
  })
}

export function useDrizzle() {
  const request = useRequestContext('POSTGRES')
  const binding = requireBinding(request.runtime.cloudflare.env.POSTGRES, 'POSTGRES')
  request.context.__nitroDrizzlePostgresDb ??= createDb(binding)
  return { db: request.context.__nitroDrizzlePostgresDb, schema, relations }
}
`
    default:
      return lazyUseDrizzleSource(
        { ...options.imports, extras: [USE_RUNTIME_CONFIG_IMPORT] },
        `  ${CONNECTION_OPTIONS_DESTRUCTURE}
  return drizzle({
    connection: {
      ...(url || connectionString ? { url: url || connectionString } : {}),
      ...options,
    },
    schema,
    relations,
  })`,
      )
  }
}
