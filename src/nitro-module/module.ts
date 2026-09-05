import type { NitroModule } from 'nitro/types'
import { configureCloudflare } from '../cloudflare/configure'
import { findEnvTemplateKeys } from '../configuration/env'
import { studioLink } from '../studio/link'
import { isMacosWithoutLocalhostDomainSupport } from '../studio/localhost-domain'
import { createDrizzleArtifactsLifecycle } from './artifacts'
import { resolveDrizzleModuleContext } from './context'
import { configureRuntime, configureStudioRuntime } from './register-runtime'

// Composition root: wires the domains together into the Nitro module. No
// domain may import from here — dependencies point inward only.
export default {
  name: '@teages/nitro-drizzle',
  async setup(nitro) {
    const logger = nitro.logger.withTag('@teages/nitro-drizzle')

    if (nitro.options.serverDir === false) {
      throw new Error(
        '@teages/nitro-drizzle requires Nitro serverDir to be enabled.',
      )
    }
    if (nitro.options.drizzle === undefined) {
      return
    }

    const ctx = await resolveDrizzleModuleContext({
      drizzle: nitro.options.drizzle,
      rootDir: nitro.options.rootDir,
      serverDir: nitro.options.serverDir,
      dev: nitro.options.dev,
    })
    if (ctx === undefined) {
      return
    }

    if (!nitro.options.experimental.envExpansion) {
      const templates = findEnvTemplateKeys(ctx.userConnection)
      if (templates.length > 0) {
        logger.warn(
          `drizzle.connection contains env templates (${templates.map(t => `{{${t}}}`).join(', ')}) but experimental.envExpansion is disabled; the literals will reach the database driver as-is. Enable experimental.envExpansion or set NITRO_ENV_EXPANSION=true.`,
        )
      }
    }

    const lifecycle = await createDrizzleArtifactsLifecycle(nitro, ctx)
    configureRuntime(nitro, ctx.devDb)
    logger.info(
      ctx.devDb === undefined
        ? `Using ${ctx.config.dialect} with ${ctx.config.driver}`
        : `Using ${ctx.config.dialect} with ${ctx.config.driver} (dev database: ${ctx.devDb.engine})`,
    )

    if (ctx.devDb !== undefined && ctx.devStudio !== undefined) {
      configureStudioRuntime(nitro)
      if (!ctx.devStudio.silent) {
        // The console link assumes the configured dev port (`nitro dev
        // --port` never reaches module setup); the DevTools dock redirect
        // is built per request and stays accurate regardless.
        const devPort = nitro.options.devServer.port ?? 3000
        logger.info(`Drizzle Studio: ${studioLink(ctx.devStudio.studioUrl, ctx.devStudio.localhostDomain, devPort)}`)
      }
      // Safari defers `*.localhost` to the system resolver, which only
      // learned the suffix in macOS 26; Chrome and Firefox are unaffected.
      // Surfaced regardless of `silent` — a broken link is an error, not noise.
      if (isMacosWithoutLocalhostDomainSupport()) {
        logger.warn(
          'This macOS release cannot resolve *.localhost domains in Safari, so the Drizzle Studio link only works in Chrome or Firefox here.',
        )
      }
    }

    configureCloudflare(nitro, lifecycle.config)
  },
} satisfies NitroModule
