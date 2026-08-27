import type { DatabaseConnection, DrizzleClientDriver, DrizzleOptions } from './public'

/**
 * Read-only projection of the public driver contract: the dialect, the
 * driver, and its optional connection. Used by helpers, the build-time and
 * CLI-side clients, and the module's immutable resolved config alike.
 */
export interface DrizzleDriverConfig {
  readonly dialect: DrizzleOptions['dialect']
  readonly driver: DrizzleClientDriver
  readonly connection?: DatabaseConnection
}
