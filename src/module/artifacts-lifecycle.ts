import type { Nitro } from 'nitro/types'
import type { ResolvedDrizzleConfig } from '../config/types'
import type { DrizzleModuleContext } from './context'
import { join } from 'node:path'
import { generateVirtualClientSource } from '../codegen/client/generate'
import { createSerializableDrizzleConfig } from '../codegen/emit'
import { createSchemaEntry } from '../codegen/schema/entry'
import { emptyConnectionDefaults } from '../config/env'
import { collectMigrationAssets } from '../migrations/assets'
import { prepareDrizzleArtifacts } from './prepare-artifacts'

export interface DrizzleArtifactsLifecycle {
  /** Resolved build-time Drizzle config. */
  readonly config: ResolvedDrizzleConfig
  readonly runtimeAssetsFolder: string
  apply: () => void
  refreshAssets: () => Promise<void>
}

/**
 * Prepares the Drizzle artifacts and keeps everything derived from them in
 * sync: the runtime config, the `#drizzle` virtual modules, and the runtime
 * migration assets.
 */
export async function createDrizzleArtifactsLifecycle(
  nitro: Nitro,
  ctx: DrizzleModuleContext,
): Promise<DrizzleArtifactsLifecycle> {
  const prepared = await prepareDrizzleArtifacts(
    nitro,
    ctx.config,
    ctx.schemaPath,
    ctx.devDb?.engine,
    ctx.relationsExport,
  )
  const runtimeAssetsFolder = join(
    nitro.options.buildDir,
    'drizzle/runtime-assets',
  )
  const migrationsFolder = join(runtimeAssetsFolder, 'migrations')

  const refreshAssets = async (): Promise<void> => {
    if (prepared.config.migrationsDir === undefined) {
      return
    }
    await collectMigrationAssets({
      sourceDir: prepared.config.migrationsDir,
      destinationDir: migrationsFolder,
      trustedDestinationRoot: nitro.options.buildDir,
    })
  }

  const apply = (): void => {
    nitro.options.runtimeConfig.drizzle = {
      ...nitro.options.runtimeConfig.drizzle,
      ...createSerializableDrizzleConfig(prepared.config),
      connection: {
        ...emptyConnectionDefaults(),
        ...ctx.userConnection,
      },
      migrationsDir: migrationsFolder,
      ...(ctx.devDb === undefined ? {} : { dev: true }),
    }
    nitro.options.virtual['#drizzle/schema'] = createSchemaEntry(
      prepared.schemaPath,
      ctx.relationsExport,
    )
    nitro.options.virtual['#drizzle'] = () => generateVirtualClientSource({
      config: ctx.devDb === undefined
        ? prepared.config
        : {
            ...prepared.config,
            driver: ctx.devDb.engine,
            connection: undefined,
          },
      schemaImport: '#drizzle/schema',
      relationsImport: '#drizzle/schema',
      ...(ctx.devDb === undefined ? {} : { dev: { connection: ctx.devDb.connection } }),
    })
  }

  await refreshAssets()
  apply()

  return {
    runtimeAssetsFolder,
    config: prepared.config,
    apply,
    refreshAssets,
  }
}
