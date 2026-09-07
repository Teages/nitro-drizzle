import type { ResolvedDrizzleConfig } from '../configuration/resolve'

export interface GenerateDrizzleArtifactsOptions {
  /** Absolute directory the declaration files are written to. */
  readonly directory: string
  readonly config: ResolvedDrizzleConfig
  readonly schemaPath: string
  readonly relationsExport?: string
}

export interface DrizzleArtifacts {
  readonly directory: string
  readonly schemaTypesFile: string
  readonly modulesFile: string
  readonly hooksFile: string
}
