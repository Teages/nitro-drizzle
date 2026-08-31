import type {
  DrizzleArtifacts,
  GenerateDrizzleArtifactsOptions,
} from './contracts'
import { mkdir, writeFile } from 'node:fs/promises'
import { createModulesDeclaration } from './module-declaration'
import { createRuntimeHooksDeclaration } from './runtime-hooks-declaration'
import { createSchemaTypes } from './schema-entry'

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
