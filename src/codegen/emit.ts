import type {
  DrizzleArtifacts,
  GenerateDrizzleArtifactsOptions,
} from './types'
import { mkdir, writeFile } from 'node:fs/promises'
import { createSchemaTypes } from './schema/entry'
import { createRuntimeHooksDeclaration } from './schema/hooks'
import { createModulesDeclaration } from './schema/modules'

export async function emitDrizzleArtifacts(
  options: GenerateDrizzleArtifactsOptions,
  artifacts: DrizzleArtifacts,
): Promise<void> {
  await mkdir(artifacts.directory, { recursive: true })
  await Promise.all([
    writeFile(
      artifacts.schemaTypesFile,
      createSchemaTypes(
        artifacts.schemaTypesFile,
        options.schemaPath,
        options.relationsExport,
      ),
    ),
    writeFile(
      artifacts.modulesFile,
      createModulesDeclaration(options.clientDriver ?? options.config.driver),
    ),
    writeFile(artifacts.hooksFile, createRuntimeHooksDeclaration()),
  ])
}
