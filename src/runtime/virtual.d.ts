declare module '#drizzle' {
  export type DrizzleDatabase = unknown
  export interface DrizzleContext {
    readonly db: DrizzleDatabase
    readonly schema: unknown
    readonly relations: unknown
  }
  export function useDrizzle(): DrizzleContext
  export const schema: unknown
  export const relations: unknown
}

declare module '#drizzle/config' {
  import type { DatabaseConnection, DrizzleClientDriver } from '../types'

  export const drizzleConfig: {
    readonly dialect: 'sqlite' | 'postgresql' | 'mysql'
    readonly driver: DrizzleClientDriver
    readonly migrationsDir: string
    readonly dev: boolean
    readonly connection: DatabaseConnection
  }
  export function useDrizzleConnection(): DatabaseConnection
}
