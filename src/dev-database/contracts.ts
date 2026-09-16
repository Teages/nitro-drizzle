import type { DrizzleLocalDriver } from '../types'

export interface ResolvedDevDatabase {
  readonly engine: DrizzleLocalDriver
  /** `undefined` only for an in-memory pglite. */
  readonly connection: string | undefined
}
