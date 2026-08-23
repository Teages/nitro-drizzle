import type { ResolvedDrizzleConfig } from '../config/types'
import type {
  DrizzleArtifacts,
  GenerateDrizzleArtifactsOptions,
} from './types'
import { mkdir, writeFile } from 'node:fs/promises'
import { createSchemaTypes } from './schema/entry'
import { createRuntimeHooksDeclaration } from './schema/hooks'
import { createModulesDeclaration } from './schema/modules'

export function createSerializableDrizzleConfig(
  config: GenerateDrizzleArtifactsOptions['config'],
): ResolvedDrizzleConfig {
  const connection = config.connection
  const safeConnection = {
    url: connection?.url?.startsWith('file:') ? connection.url : '',
    uri: '',
    authToken: '',
    connectionString: '',
    host: '',
    port: 0,
    user: '',
    password: '',
    database: '',
    accountId: connection?.accountId ?? '',
    apiToken: '',
    databaseId: connection?.databaseId ?? '',
    hyperdriveId: connection?.hyperdriveId ?? '',
    ...(connection?.prepare === undefined ? {} : { prepare: connection.prepare }),
    ...(connection?.dataDir === undefined ? {} : { dataDir: connection.dataDir }),
  }
  return {
    ...config,
    connection: safeConnection,
  }
}

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
