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
      // The declarations describe the configured driver — the dev database
      // swaps only the runtime client, so every context emits the same files.
      createModulesDeclaration(options.config.driver, options.mockEngine),
    ),
    writeFile(artifacts.hooksFile, createRuntimeHooksDeclaration()),
  ])
}
