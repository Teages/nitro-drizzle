import type { DatabaseConnection, DrizzleClientDriver, DrizzleOptions } from '../types'

/**
 * Read-only projection of the public DrizzleOptions contract used by helpers.
 * It accepts both raw options and the module's immutable resolved config.
 */
export interface DrizzleDriverConfig {
  readonly dialect: DrizzleOptions['dialect']
  readonly driver: DrizzleClientDriver
  readonly connection?: DatabaseConnection
}

/**
 * Client configuration for the build-time and CLI-side clients, which run on
 * the configured public driver.
 */
export interface DrizzleBuildClientConfig extends Omit<DrizzleDriverConfig, 'driver'> {
  readonly driver: DrizzleOptions['driver']
}
