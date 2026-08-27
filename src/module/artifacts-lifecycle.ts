import type { Nitro } from 'nitro/types'
import type { ResolvedDrizzleConfig } from '../contracts/configuration'
import type { DrizzleModuleContext } from './context'
import { generateDrizzleArtifacts } from '../codegen/generate'
import { createSchemaEntry } from '../codegen/schema/entry'
import { generateVirtualClientSource } from '../virtual-client/generate'
import { createRuntimeConfigModule } from '../virtual-client/runtime-config'

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
  await generateDrizzleArtifacts({
    buildDir: nitro.options.buildDir,
    config: ctx.config,
    schemaPath: ctx.schemaPath,
    ...(ctx.relationsExport === undefined ? {} : { relationsExport: ctx.relationsExport }),
    ...(ctx.devDb?.engine === undefined ? {} : { clientDriver: ctx.devDb.engine }),
  })

  const apply = (): void => {
    // Module-owned runtime config: connection values never pass through
    // Nitro's runtimeConfig. The virtual always carries the real database
    // config; the dev database only swaps the client driver in `#drizzle`.
    nitro.options.virtual['#drizzle/config'] = createRuntimeConfigModule({
      dialect: ctx.config.dialect,
      driver: ctx.config.driver,
      devMock: ctx.devDb !== undefined,
      ...(ctx.devDb === undefined
        ? {}
        : { devEngine: ctx.devDb.engine, devConnection: ctx.devDb.connection ?? ':memory:' }),
      ...(ctx.devStudio === undefined ? {} : { devStudio: ctx.devStudio }),
      connection: ctx.userConnection,
    })
    nitro.options.virtual['#drizzle/schema'] = createSchemaEntry(
      ctx.schemaPath,
      ctx.relationsExport,
    )
    nitro.options.virtual['#drizzle'] = () => generateVirtualClientSource({
      config: ctx.devDb === undefined
        ? ctx.config
        : {
            ...ctx.config,
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
    config: ctx.config,
    apply,
  }
}
