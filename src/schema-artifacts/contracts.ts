import type { ResolvedDrizzleConfig } from '../configuration/resolve'
import type { DrizzleLocalDriver } from '../types'

export interface GenerateDrizzleArtifactsOptions {
  /** Absolute directory the declaration files are written to. */
  readonly directory: string
  readonly config: ResolvedDrizzleConfig
  readonly schemaPath: string
  readonly relationsExport?: string
  /**
   * Local engine the declarations type `mockDb` for — the engine a dev
   * session actually runs, resolved from the configured `drizzle.devMock`.
   * Absent when devMock is unset or cannot resolve: `mockDb` then types as
   * plain `undefined`.
   */
  readonly mockEngine?: DrizzleLocalDriver
}

export interface DrizzleArtifacts {
  readonly directory: string
  readonly schemaTypesFile: string
  readonly modulesFile: string
  readonly hooksFile: string
}
