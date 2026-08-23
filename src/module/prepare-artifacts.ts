import type { Nitro } from 'nitro/types'
import type { PreparedDrizzleArtifacts } from '../codegen/types'
import type { ResolvedDrizzleConfig } from '../config/types'
import type { DrizzleClientDriver } from '../types'
import { generateDrizzleArtifacts } from '../codegen/generate'

export async function prepareDrizzleArtifacts(
  nitro: Nitro,
  config: ResolvedDrizzleConfig,
  schemaPath: string,
  clientDriver?: DrizzleClientDriver,
  relationsExport?: string,
): Promise<PreparedDrizzleArtifacts> {
  const artifacts = await generateDrizzleArtifacts({
    buildDir: nitro.options.buildDir,
    config,
    schemaPath,
    ...(relationsExport === undefined ? {} : { relationsExport }),
    ...(clientDriver === undefined ? {} : { clientDriver }),
  })

  return {
    config,
    schemaPath,
    artifacts,
  }
}
