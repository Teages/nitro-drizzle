import type {
  DrizzleArtifacts,
  GenerateDrizzleArtifactsOptions,
} from './contracts'
import { join } from 'node:path'
import { emitDrizzleArtifacts } from './emit'

export async function generateDrizzleArtifacts(
  options: GenerateDrizzleArtifactsOptions,
): Promise<DrizzleArtifacts> {
  const directory = join(options.buildDir, 'drizzle')
  const artifacts = {
    directory,
    schemaTypesFile: join(directory, 'schema.d.ts'),
    modulesFile: join(directory, 'modules.d.ts'),
    hooksFile: join(directory, 'hooks.d.ts'),
  }
  await emitDrizzleArtifacts(options, artifacts)
  return artifacts
}
