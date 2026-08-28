import type { DatabaseConnection, DrizzleClientDriver, DrizzleDialect } from './public'

/**
 * Read-only projection of the public driver contract: the dialect, the
 * driver, and its optional connection. Used by helpers, the build-time and
 * CLI-side clients, and the module's immutable resolved config alike.
 */
export interface DrizzleDriverConfig {
  readonly dialect: DrizzleDialect
  readonly driver: DrizzleClientDriver
  readonly connection?: DatabaseConnection
}
