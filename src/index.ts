import type { NitroModule } from 'nitro/types'
import type { DatabaseConnection, DrizzleClientDriver, DrizzleDevOptions, DrizzleDialect, DrizzleLocalDriver, DrizzleOptions, DrizzleSchemaPath, DrizzleSchemaPaths } from './types'
import { findEnvTemplateKeys } from './config/env'
import { createDrizzleArtifactsLifecycle } from './module/artifacts-lifecycle'
import { configureCloudflare } from './module/cloudflare/configure'
import { resolveDrizzleModuleContext } from './module/context'
import { configureRuntime } from './module/register-runtime'
import { configureOutputAssets } from './module/ship-migration-assets'

// Declared inline on the entry: bundlers drop side-effect-only type imports
// when generating the shipped declarations, which would strip these
// augmentations from dist.
declare module 'nitro/types' {
  interface NitroOptions {
    drizzle?: DrizzleOptions
  }
}

export default {
  name: '@teages/nitro-drizzle',
  async setup(nitro) {
    if (nitro.options.serverDir === false) {
      throw new Error(
        '@teages/nitro-drizzle requires Nitro serverDir to be enabled.',
      )
    }

    const ctx = resolveDrizzleModuleContext(nitro)
    if (ctx === undefined) {
      return
    }

    if (!nitro.options.experimental.envExpansion) {
      const templates = findEnvTemplateKeys(ctx.userConnection)
      if (templates.length > 0) {
        nitro.logger.withTag('@teages/nitro-drizzle').warn(
          `drizzle.connection contains env templates (${templates.map(t => `{{${t}}}`).join(', ')}) but experimental.envExpansion is disabled; the literals will reach the database driver as-is. Enable experimental.envExpansion or set NITRO_ENV_EXPANSION=true.`,
        )
      }
    }

    const lifecycle = await createDrizzleArtifactsLifecycle(nitro, ctx)
    configureRuntime(nitro, ctx.devDb)
    configureCloudflare(nitro, lifecycle.config)
    configureOutputAssets(nitro, lifecycle)

    nitro.logger.withTag('@teages/nitro-drizzle').info(
      ctx.devDb === undefined
        ? `Using ${ctx.config.dialect} with ${ctx.config.driver}`
        : `Using ${ctx.config.dialect} with ${ctx.config.driver} (dev database: ${ctx.devDb.engine})`,
    )
  },
} satisfies NitroModule

export type {
  DatabaseConnection,
  DrizzleClientDriver,
  DrizzleDevOptions,
  DrizzleDialect,
  DrizzleLocalDriver,
  DrizzleOptions,
  DrizzleSchemaPath,
  DrizzleSchemaPaths,
}
