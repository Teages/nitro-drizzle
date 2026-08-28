/**
 * Ambient declaration for the `#drizzle/config` virtual module consumed by
 * this package's runtime plugins. Unlike the schema-derived `#drizzle`
 * types (generated per project into `.nitro/drizzle`), the config shape is
 * package-fixed and mirrors `RuntimeDrizzleConfig` in
 * `src/virtual-client/runtime-config.ts`.
 */
declare module '#drizzle/config' {
  import type { DatabaseConnection, DrizzleClientDriver, DrizzleDialect, DrizzleLocalDriver } from '@teages/nitro-drizzle'

  export interface DrizzleRuntimeConfig {
    readonly dialect: DrizzleDialect
    readonly driver: DrizzleClientDriver
    readonly devMock: boolean
    readonly devEngine?: DrizzleLocalDriver
    readonly devConnection?: string
    readonly devStudio?: {
      readonly port: number | undefined
      readonly silent: boolean
      readonly studioUrl: string
    }
    readonly connection: DatabaseConnection
  }

  export const drizzleConfig: DrizzleRuntimeConfig
  export function useDrizzleConnection(): DatabaseConnection
}
