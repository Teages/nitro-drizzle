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
