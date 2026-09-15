import type { DrizzleDriver, DrizzleLocalDriver } from '../types'
import { resolveDriverAdapterPath } from '../database/registry'

/**
 * Connection type per config-constructing driver, mirroring what each
 * adapter's `drizzle({ connection })` accepts. `d1` and `d1-http` construct
 * from a client and never fire the config hook.
 */
const CONNECTION_TYPES: Readonly<Record<Exclude<DrizzleDriver, 'd1' | 'd1-http'>, string>> = {
  'pglite': `string | Partial<import('@electric-sql/pglite').PGliteOptions> & { dataDir?: string }`,
  'better-sqlite3': `string | { source?: string } & Partial<import('better-sqlite3').Options>`,
  'libsql': `string | import('@libsql/client').Config`,
  'node-sqlite': `string | { path?: string } & Partial<import('node:sqlite').DatabaseSyncOptions>`,
  'bun-sqlite': `string | { source?: string } & Partial<import('bun:sqlite').DatabaseOptions>`,
  'postgres-js': `string | { url?: string } & Partial<import('postgres').Options>`,
  'mysql2': `string | Partial<import('mysql2/promise').PoolOptions>`,
  'neon-http': `string | { connectionString: string }`,
}

function configPayload(driver: DrizzleDriver, mockEngine: DrizzleLocalDriver | undefined): string | undefined {
  const key = mockEngine ?? driver
  if (key === 'd1' || key === 'd1-http') {
    return undefined
  }
  return CONNECTION_TYPES[key]
}

function setupClient(mockEngine: DrizzleLocalDriver | undefined): string {
  if (mockEngine === undefined) {
    return 'unknown'
  }
  return `ReturnType<typeof import(${JSON.stringify(resolveDriverAdapterPath(mockEngine))}).drizzle>['$client']`
}

/** The leading `export {}` is load-bearing: without it the `declare module` shadows nitro/types. */
export function createRuntimeHooksDeclaration(
  driver: DrizzleDriver,
  mockEngine?: DrizzleLocalDriver,
): string {
  const connection = configPayload(driver, mockEngine)
  const configHook = connection === undefined
    ? ''
    : `    /**
     * Fired before the drizzle client is constructed; handlers mutate the
     * config in place.
     */
    'drizzle:config': (config: NitroDrizzleConfig) => void | Promise<void>
`
  return `export {}

declare module 'nitro/types' {
  interface NitroRuntimeHooks {
${configHook}    /** Fired once the dev client exists, before every schema push. */
    'drizzle:dev-mock:setup': (client: NitroDrizzleMockClient) => void | Promise<void>
    /** Fired once the schema is pushed. */
    'drizzle:dev-mock:seed': () => void | Promise<void>
  }
}

interface NitroDrizzleConfig {
  connection?: ${connection ?? 'unknown'}
  casing?: 'snake_case' | 'camelCase'
  logger?: import('drizzle-orm').Logger
}

type NitroDrizzleMockClient = ${setupClient(mockEngine)}
`
}
