import type { DrizzleDriverConfig } from '../../drivers/contracts'
import type { DrizzleClientDriver } from '../../types'
import type { DevClientConnection, SourceImports } from './templates/helpers'
import { resolveDriverAdapterPath } from '../../drivers/registry'
import { betterSqlite3Source } from './templates/better-sqlite3'
import { bunSqliteSource } from './templates/bun-sqlite'
import { d1Source } from './templates/d1'
import { d1HttpSource } from './templates/d1-http'
import { libsqlSource } from './templates/libsql'
import { mysql2Source } from './templates/mysql2'
import { neonHttpSource } from './templates/neon-http'
import { nodeSqliteSource } from './templates/node-sqlite'
import { pgliteSource } from './templates/pglite'
import { postgresJsSource } from './templates/postgres-js'

export interface GenerateVirtualClientOptions {
  readonly config: DrizzleDriverConfig
  readonly schemaImport: string
  readonly relationsImport: string
  /**
   * Dev-database mode: bake the resolved local connection into the generated
   * source instead of reading it from runtime config.
   */
  readonly dev?: DevClientConnection
}

export class VirtualClientGenerationError extends Error {
  constructor(
    readonly code: 'dialect_mismatch',
    readonly driver: DrizzleClientDriver,
    message: string,
  ) {
    super(message)
    this.name = 'VirtualClientGenerationError'
  }
}

function assertNever(value: never): never {
  throw new VirtualClientGenerationError(
    'dialect_mismatch',
    value,
    `Unsupported Drizzle driver: ${String(value)}`,
  )
}

export function resolveClientAdapterPath(driver: DrizzleClientDriver): string {
  return resolveDriverAdapterPath(driver)
}

export function generateVirtualClientSource(
  options: GenerateVirtualClientOptions,
): string {
  const { config } = options
  const imports: SourceImports = {
    adapter: resolveClientAdapterPath(config.driver),
    schema: options.schemaImport,
    relations: options.relationsImport,
  }

  switch (config.driver) {
    case 'better-sqlite3':
      return betterSqlite3Source(imports, options.dev)
    case 'bun-sqlite':
      return bunSqliteSource(imports, options.dev)
    case 'libsql':
      return libsqlSource(imports, options.dev)
    case 'node-sqlite':
      return nodeSqliteSource(imports, options.dev)
    case 'pglite':
      return pgliteSource(imports, options.dev)
    case 'neon-http':
      return neonHttpSource(imports)
    case 'd1':
      return d1Source(imports)
    case 'd1-http':
      return d1HttpSource(imports)
    case 'postgres-js':
      return postgresJsSource({
        imports,
        variant: config.connection?.hyperdriveId !== undefined
          ? 'hyperdrive'
          : 'standard',
      })
    case 'mysql2':
      return mysql2Source({
        imports,
        variant: config.connection?.hyperdriveId !== undefined
          ? 'hyperdrive'
          : 'standard',
      })
    default:
      return assertNever(config.driver)
  }
}
