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
  import type { DatabaseConnection, DrizzleClientDriver, DrizzleLocalDriver } from '../public'

  export const drizzleConfig: {
    readonly dialect: 'sqlite' | 'postgresql' | 'mysql'
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
  export function useDrizzleConnection(): DatabaseConnection
}
