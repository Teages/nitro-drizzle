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
  port?: number
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

export type DrizzleDialect = 'sqlite' | 'postgresql' | 'mysql'

export interface DrizzleSchemaPaths {
  readonly sqlite?: string
  readonly postgresql?: string
  readonly mysql?: string
}

export type DrizzleSchemaPath = string | DrizzleSchemaPaths

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
  driver: 'better-sqlite3' | 'libsql' | 'bun-sqlite' | 'node-sqlite' | 'd1' | 'd1-http' | 'postgres-js' | 'pglite' | 'neon-http' | 'mysql2'
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
   * `experimental.envExpansion`. `<prefix>DRIZZLE_CONNECTION_*` environment
   * overrides apply at runtime for keys defined here.
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
   * writes new migrations here, and every migration in it is applied in order.
   * @default '<serverDir>/db/migrations/<dialect>'
   */
  migrationsDir?: string
  /**
   * Run `nitro dev` against a disposable local dev database instead of the
   * configured connection. The schema is pushed with drizzle-kit on startup,
   * destructive statements apply without confirmation, and the drizzle-kit CLI
   * plus the `db:migrate` task keep targeting the real database.
   *
   * Set `NITRO_DRIZZLE_DEV=false` to opt out for a single run.
   */
  dev?: true | DrizzleDevOptions
}

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

/**
 * Any driver a `#drizzle` virtual client can be generated for.
 */
export type DrizzleClientDriver = DrizzleOptions['driver']

export interface DrizzleDevOptions {
  /**
   * Local engine for the dev database. When omitted the module resolves one
   * per dialect: `postgresql` uses `pglite`; `sqlite` prefers the built-in
   * `bun:sqlite` / `node:sqlite` engines and otherwise falls back to the main
   * driver when it can run locally.
   */
  driver?: DrizzleLocalDriver
  /**
   * Persist the dev database at this path instead of keeping it in memory.
   * The `NITRO_DRIZZLE_DEV_FILE` environment variable overrides this value.
   */
  file?: string
}
