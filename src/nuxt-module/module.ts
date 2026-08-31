import type {} from '@nuxt/nitro-server'
import type { DrizzleOptions } from '../types'

import { env } from 'node:process'
import { addVitePlugin, createResolver, defineNuxtModule, logger } from '@nuxt/kit'
import { DEV_ENV_FLAG } from '../dev-database/resolve'
import drizzleDevtool from '../devtool'
import DrizzleModule from '../nitro-module/module'

export default defineNuxtModule<DrizzleOptions>({
  meta: {
    name: '@teages/nitro-drizzle',
    configKey: 'drizzle',
  },
  async setup(options, nuxt) {
    const buildResolver = createResolver(nuxt.options.buildDir)

    nuxt.hook('nitro:config', (config) => {
      config.modules ??= []
      config.modules.push(DrizzleModule)
      if (config.drizzle) {
        logger.warn('drizzle config in `nitro.drizzle` will be ignored')
      }
      config.drizzle = options
    })

    // The Vite DevTools dock is only usable when the studio route will
    // exist. This mirrors resolveDrizzleModuleContext's gating without
    // resolving engines — invalid dev combos still fail in the Nitro module.
    const studioSession = nuxt.options.dev
      && options.devMock !== undefined
      && env[DEV_ENV_FLAG] !== 'false'
      && (options.devMock === true || options.devMock.studio !== false)
    if (studioSession) {
      // Cast across a dev-graph seam: this repo resolves a second vite type
      // instance next to kit's peer, so the Plugin type cannot cross into
      // addVitePlugin's signature without it. Consumers have one vite and
      // no boundary here.
      addVitePlugin(drizzleDevtool() as Parameters<typeof addVitePlugin>[0])
    }

    nuxt.hook('nitro:prepare:types', ctx =>
      [
        './drizzle/hooks.d.ts',
        './drizzle/modules.d.ts',
        './drizzle/schema.d.ts',
      ]
        .forEach(path => ctx.references.push({ path: buildResolver.resolve(path) })))
  },
})
