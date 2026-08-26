import type { Nitro } from 'nitro/types'
import type { ResolvedDrizzleConfig } from '../config/types'
import type { DrizzleModuleContext } from './context'
import { generateVirtualClientSource } from '../codegen/client/generate'
import { createRuntimeConfigModule } from '../codegen/client/runtime-config'
import { createSchemaEntry } from '../codegen/schema/entry'
import { prepareDrizzleArtifacts } from './prepare-artifacts'

export interface DrizzleArtifactsLifecycle {
  /** Resolved build-time Drizzle config. */
  readonly config: ResolvedDrizzleConfig
  apply: () => void
}

/**
 * Prepares the Drizzle artifacts and keeps everything derived from them in
 * sync: the runtime config and the `#drizzle` virtual modules.
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

  const apply = (): void => {
    // Module-owned runtime config: connection values never pass through
    // Nitro's runtimeConfig. The virtual always carries the real database
    // config; the dev database only swaps the client driver in `#drizzle`.
    nitro.options.virtual['#drizzle/config'] = createRuntimeConfigModule({
      dialect: prepared.config.dialect,
      driver: prepared.config.driver,
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

  apply()

  return {
    config: prepared.config,
    apply,
  }
}
