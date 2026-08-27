import type { NitroModule } from 'nitro/types'
import type { DatabaseConnection, DrizzleClientDriver, DrizzleDevMockOptions, DrizzleDevStudioOptions, DrizzleDialect, DrizzleLocalDriver, DrizzleOptions, DrizzleSchemaPath, DrizzleSchemaPaths } from './contracts/public'
import { configureCloudflare } from './cloudflare/configure'
import { findEnvTemplateKeys } from './configuration/env'
import { createDrizzleArtifactsLifecycle } from './module/artifacts-lifecycle'
import { resolveDrizzleModuleContext } from './module/context'
import { configureRuntime, configureStudioRuntime } from './module/register-runtime'

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
    if (ctx.devDb !== undefined && ctx.devStudio !== undefined) {
      configureStudioRuntime(nitro)
    }
    else if (nitro.options.dev && ctx.devDb === undefined) {
      nitro.logger.withTag('@teages/nitro-drizzle').info(
        'Drizzle Studio: enable the dev database (drizzle.devMock) for the built-in studio, or run `npx drizzle-kit studio` against a real connection.',
      )
    }
    configureCloudflare(nitro, lifecycle.config)

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
  DrizzleDevMockOptions,
  DrizzleDevStudioOptions,
  DrizzleDialect,
  DrizzleLocalDriver,
  DrizzleOptions,
  DrizzleSchemaPath,
  DrizzleSchemaPaths,
}
