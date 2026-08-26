import type { Nitro } from 'nitro/types'
import type { ResolvedDrizzleConfig } from '../config/types'
import type { DrizzleModuleContext } from './context'
import { join } from 'node:path'
import { generateVirtualClientSource } from '../codegen/client/generate'
import { createRuntimeConfigModule } from '../codegen/client/runtime-config'
import { createSchemaEntry } from '../codegen/schema/entry'
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
    // Module-owned runtime config: connection values never pass through
    // Nitro's runtimeConfig. The virtual always carries the real database
    // config; the dev database only swaps the client driver in `#drizzle`.
    nitro.options.virtual['#drizzle/config'] = createRuntimeConfigModule({
      dialect: prepared.config.dialect,
      driver: prepared.config.driver,
      migrationsDir: migrationsFolder,
      dev: ctx.devDb !== undefined,
      ...(ctx.devDb === undefined
        ? {}
        : { devEngine: ctx.devDb.engine, devConnection: ctx.devDb.connection ?? ':memory:' }),
      ...(ctx.devStudio === undefined ? {} : { devStudio: ctx.devStudio }),
      connection: ctx.userConnection,
    })
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
