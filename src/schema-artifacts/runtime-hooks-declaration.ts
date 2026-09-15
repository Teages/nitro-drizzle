import type { DrizzleLocalDriver } from '../types'
import { resolveDriverAdapterPath } from '../database/registry'
import { DEV_DATABASE_CONFIG_HOOK, DEV_DATABASE_SEED_HOOK, DEV_DATABASE_SETUP_HOOK } from '../dev-database/contracts'

/**
 * Object half of `config.connection` per dev engine, mirroring what each
 * adapter's `drizzle({ connection })` accepts. `libsql` keeps `Config` as-is
 * so the required `url` stays required; `bun-sqlite` options live in
 * `bun:sqlite`, whose types only exist under Bun, so it degrades to a plain
 * record.
 */
const DEV_CONNECTION_TYPES: Readonly<Record<DrizzleLocalDriver, string>> = {
  'pglite': `Partial<import('@electric-sql/pglite').PGliteOptions> & { dataDir?: string }`,
  'better-sqlite3': `{ source?: string } & Partial<import('better-sqlite3').Options>`,
  'libsql': `import('@libsql/client').Config`,
  'node-sqlite': `{ path?: string } & Partial<import('node:sqlite').DatabaseSyncOptions>`,
  'bun-sqlite': `Record<string, unknown>`,
}

/**
 * Client type the setup hook receives. `drizzle()` on every local engine is
 * a single generic signature defaulting to its own client, so `ReturnType`
 * derives `$client` (PGlite, better-sqlite3 Database, libSQL Client, …)
 * without dragging the schema types in — the declaration stays self-contained.
 * Without a resolvable `drizzle.devMock` the payloads degrade (`connection`
 * to `unknown`, client to `unknown`), mirroring how `mockDb` degrades to
 * `undefined`.
 */
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
     * The dev database is about to be constructed. The config object the
     * engine's \`drizzle()\` call receives arrives here: mutate it in place,
     * most notably \`config.connection\` — a string or the engine's options
     * object — to customize construction, for example registering PGlite
     * extension packages through \`{ extensions: [...] }\`. An in-memory
     * pglite carries no connection until a handler adds one. Called before
     * every (re)construction; only fired when the dev database is enabled.
     */
    '${DEV_DATABASE_CONFIG_HOOK}': (config: NitroDrizzleMockConfig) => void | Promise<void>
    /**
     * The dev database client exists but the schema is not pushed yet:
     * enable engine capabilities here — CREATE EXTENSION, LOAD EXTENSION,
     * pragmas. The raw client of the resolved dev engine arrives as the
     * first argument. Called before every push, so keep it idempotent;
     * only fired when the dev database is enabled.
     */
    '${DEV_DATABASE_SETUP_HOOK}': (client: NitroDrizzleMockClient) => void | Promise<void>
    /**
     * The dev database is ready: schema pushed, migrations applied. Seed
     * test data here; only fired when the dev database is enabled.
     */
    '${DEV_DATABASE_SEED_HOOK}': () => void | Promise<void>
  }
}

interface NitroDrizzleMockConfig {
  /**
   * Connection the dev engine's drizzle() call builds with. Replacing it
   * with an options object customizes construction (PGlite extensions,
   * native client options); the baked value stays when left untouched —
   * and may never have existed, for an in-memory pglite.
   */
  connection?: ${connection}
}

type NitroDrizzleMockClient = ${client}
`
}
