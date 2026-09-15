import type { DrizzleLocalDriver } from '../types'
import { resolveDriverAdapterPath } from '../database/registry'
import { DEV_DATABASE_CONFIG_HOOK, DEV_DATABASE_SEED_HOOK, DEV_DATABASE_SETUP_HOOK } from '../dev-database/contracts'

/** `bun-sqlite` options live in `bun:sqlite`, whose types only exist under Bun. */
const DEV_CONNECTION_TYPES: Readonly<Record<DrizzleLocalDriver, string>> = {
  'pglite': `Partial<import('@electric-sql/pglite').PGliteOptions> & { dataDir?: string }`,
  'better-sqlite3': `{ source?: string } & Partial<import('better-sqlite3').Options>`,
  'libsql': `import('@libsql/client').Config`,
  'node-sqlite': `{ path?: string } & Partial<import('node:sqlite').DatabaseSyncOptions>`,
  'bun-sqlite': `Record<string, unknown>`,
}

function payloadTypes(mockEngine: DrizzleLocalDriver | undefined): {
  connection: string
  client: string
} {
  if (mockEngine === undefined) {
    return { connection: 'unknown', client: 'unknown' }
  }
  const adapter = JSON.stringify(resolveDriverAdapterPath(mockEngine))
  return {
    connection: `string | ${DEV_CONNECTION_TYPES[mockEngine]}`,
    client: `ReturnType<typeof import(${adapter}).drizzle>['$client']`,
  }
}

/** The leading `export {}` is load-bearing: without it the `declare module` shadows nitro/types. */
export function createRuntimeHooksDeclaration(mockEngine?: DrizzleLocalDriver): string {
  const { connection, client } = payloadTypes(mockEngine)
  return `export {}

declare module 'nitro/types' {
  interface NitroRuntimeHooks {
    /**
     * Fired before the dev database is constructed; handlers mutate the
     * config in place.
     */
    '${DEV_DATABASE_CONFIG_HOOK}': (config: NitroDrizzleMockConfig) => void | Promise<void>
    /** Fired once the dev client exists, before every schema push. */
    '${DEV_DATABASE_SETUP_HOOK}': (client: NitroDrizzleMockClient) => void | Promise<void>
    /** Fired once the schema is pushed. */
    '${DEV_DATABASE_SEED_HOOK}': () => void | Promise<void>
  }
}

interface NitroDrizzleMockConfig {
  connection?: ${connection}
}

type NitroDrizzleMockClient = ${client}
`
}
