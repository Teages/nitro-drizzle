import type { ResolvedDrizzleConfig } from '../configuration/resolve'
import type { DrizzleDriver } from '../types'

export interface GenerateDrizzleArtifactsOptions {
  /** Absolute directory the declaration files are written to. */
  readonly directory: string
  readonly config: ResolvedDrizzleConfig
  readonly schemaPath: string
  readonly relationsExport?: string
  /**
   * Driver the `#drizzle` types are declared for. Defaults to the configured
   * driver; the dev database overrides it with the resolved local engine
   * while the drizzle-kit config keeps targeting the real database.
   */
  readonly clientDriver?: DrizzleDriver
}

export interface DrizzleArtifacts {
  readonly directory: string
  readonly schemaTypesFile: string
  readonly modulesFile: string
  readonly hooksFile: string
}
