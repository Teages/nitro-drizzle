export type DrizzleDialect = 'sqlite' | 'postgresql' | 'mysql'

export type DrizzleDriver
  = | 'better-sqlite3' | 'libsql' | 'bun-sqlite' | 'node-sqlite' | 'd1' | 'd1-http'
    | 'postgres-js' | 'pglite' | 'neon-http'
    | 'mysql2'

/**
 * Local engines the dev database can run on: every public driver that embeds
 * its database instead of connecting to a server.
 */
export type DrizzleLocalDriver
  = | 'pglite'
    | 'better-sqlite3'
    | 'libsql'
    | 'bun-sqlite'
    | 'node-sqlite'

// TODO: make it accept string only
export type DrizzleSchemaPath = string | { sqlite?: string, postgresql?: string, mysql?: string }

export interface DrizzleOptions {
  /**
   * Database dialect
   */
  dialect: DrizzleDialect
  /**
   * Database driver
   *
   * SQLite drivers: 'better-sqlite3', 'libsql', 'bun-sqlite', 'node-sqlite', 'd1', 'd1-http'
   * PostgreSQL drivers: 'postgres-js', 'pglite', 'neon-http'
   * MySQL drivers: 'mysql2'
   */
  driver: DrizzleDriver
  /**
   * The single schema entry module. A string is convenient for applications
   * using one dialect; a dialect map selects exactly one entry for the
   * configured dialect. The entry may export a `relations` value alongside
   * its table exports.
   */
  schemaPath: DrizzleSchemaPath
  /**
   * Static database connection. Values are used as-is by default; `{{VAR}}`
   * templates expand at runtime when the user enables Nitro's
   * `experimental.envExpansion`.
   */
  connection?: DatabaseConnection
  /**
   * Name of the Drizzle v1 relations value exported by the schema entry.
   * The generated client always exposes it as `relations`.
   * @default 'relations'
   */
  relationsExport?: string
  /**
   * The directory holding the Drizzle migration chain. `drizzle-kit generate`
   * writes new migrations here; apply them with the drizzle-kit CLI.
   * @default '<serverDir>/db/migrations/<dialect>'
   */
  migrationsDir?: string
  /**
   * Run `nitro dev` against a disposable local dev database instead of the
   * configured connection. The schema is pushed with drizzle-kit on startup,
   * destructive statements apply without confirmation, and the drizzle-kit CLI
   * keeps targeting the real database.
   *
   * Set `NITRO_DRIZZLE_DEV_MOCK=false` to opt out for a single run.
   */
  devMock?: true | DrizzleDevMockOptions
}

export interface DrizzleDevMockOptions {
  /**
   * Local engine for the dev database. When omitted the module resolves one
   * per dialect: `postgresql` uses `pglite`; `sqlite` prefers the built-in
   * `bun:sqlite` / `node:sqlite` engines and otherwise falls back to the main
   * driver when it can run locally.
   */
  driver?: DrizzleLocalDriver
  /**
   * Persist the dev database at this path instead of keeping it in memory.
   * The `NITRO_DRIZZLE_DEV_MOCK_FILE` environment variable overrides this value.
   */
  file?: string
  /**
   * The built-in Drizzle Studio that ships with dev-database sessions: the
   * dev server serves the Studio API behind a per-session unguessable
   * `*.localhost` host — no separate listener, no extra port. `false`
   * disables it; an object customizes it; omitted or `true` uses the
   * defaults.
   */
  studio?: boolean | DrizzleDevStudioOptions
}

export interface DrizzleDevStudioOptions {
  /**
   * Skip the startup log line pointing at the Studio web app. Startup errors
   * are still reported.
   * @default false
   */
  silent?: boolean
  /**
   * Base URL of the Studio web app. It is used both for the startup link and
   * as the origin the loopback proxy accepts requests from, so pointing it at
   * a self-hosted Studio frontend keeps the origin check meaningful.
   * @default 'https://local.drizzle.studio'
   */
  studioUrl?: string
}

export interface DatabaseConnection {
  /**
   * Database connection URL
   */
  url?: string
  /**
   * Database connection URI
   */
  uri?: string
  /**
   * Auth token (for Turso/libSQL)
   */
  authToken?: string
  /**
   * Connection string (for PostgreSQL)
   */
  connectionString?: string
  /**
   * Database host
   */
  host?: string
  /**
   * Database port
   */
  port?: number | string
  /**
   * Database username
   */
  user?: string
  /**
   * Database password
   */
  password?: string
  /**
   * Database name
   */
  database?: string
  /**
   * Cloudflare Account ID (for D1 HTTP driver)
   */
  accountId?: string
  /**
   * Cloudflare API Token (for D1 HTTP driver)
   */
  apiToken?: string
  /**
   * Cloudflare D1 Database ID (for D1 driver and D1 HTTP driver)
   */
  databaseId?: string
  /**
   * Cloudflare Hyperdrive ID for auto-generating wrangler bindings (PostgreSQL/MySQL)
   */
  hyperdriveId?: string
  /**
   * Disable prepared statements (postgres-js / Hyperdrive)
   */
  prepare?: boolean
  /**
   * PGlite data directory
   */
  dataDir?: string
  /**
   * Additional connection options
   */
  [key: string]: unknown
}
