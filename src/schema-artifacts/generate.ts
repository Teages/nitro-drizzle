import type {
  DrizzleArtifacts,
  GenerateDrizzleArtifactsOptions,
} from './contracts'
import { join, resolve } from 'node:path'
import { emitDrizzleArtifacts } from './emit'

/** Default location of the generated type declarations, relative to the project root. */
export const DEFAULT_TYPES_DIR = 'node_modules/.nitro-drizzle'

/**
 * Resolves the `drizzle.typesDir` option against the project root.
 * `false` disables type generation.
 */
export function resolveDrizzleTypesDir(
  rootDir: string,
  typesDir: string | false | undefined,
): string | false {
  return typesDir === false
    ? false
    : resolve(rootDir, typesDir ?? DEFAULT_TYPES_DIR)
}

export async function generateDrizzleArtifacts(
  options: GenerateDrizzleArtifactsOptions,
): Promise<DrizzleArtifacts> {
  const directory = options.directory
  const artifacts = {
    directory,
    schemaTypesFile: join(directory, 'schema.d.ts'),
    modulesFile: join(directory, 'modules.d.ts'),
    hooksFile: join(directory, 'hooks.d.ts'),
  }
  await emitDrizzleArtifacts(options, artifacts)
  return artifacts
}
