import type {} from '@nuxt/nitro-server'
import type { DrizzleOptions } from '../types'

import { env } from 'node:process'
import { addTemplate, addVitePlugin, createResolver, defineNuxtModule, logger } from '@nuxt/kit'
import { DEV_ENV_FLAG } from '../dev-database/resolve'
import drizzleDevtool from '../devtool'
import DrizzleModule from '../nitro-module/module'

const DRIZZLE_TYPE_ARTIFACTS = [
  './drizzle/hooks.d.ts',
  './drizzle/modules.d.ts',
  './drizzle/schema.d.ts',
]

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

    // The generated declarations join both server projects (nitro types) and
    // the app project, so `#drizzle` types infer across environments.
    nuxt.hook('nitro:prepare:types', ctx =>
      DRIZZLE_TYPE_ARTIFACTS.forEach(path =>
        ctx.references.push({ path: buildResolver.resolve(path) })))
    nuxt.hook('prepare:types', ctx =>
      DRIZZLE_TYPE_ARTIFACTS.forEach(path =>
        ctx.references.push({ path: buildResolver.resolve(path) })))

    // In the browser `#drizzle` resolves to a stub: importing `useDrizzle`
    // compiles, calling it throws. SSR and the Nitro server always resolve
    // Nitro's real virtual before this alias (resolve order "pre"). The alias
    // must be the template's absolute `dst` — a `#build/...` value would land
    // verbatim in the app tsconfig paths, which rejects non-relative paths.
    const appGate = addTemplate({
      filename: 'app-drizzle-gate.mjs',
      write: true,
      getContents: () => 'export function useDrizzle() { throw new Error(\'Drizzle is not available in client\') }',
    })
    nuxt.options.alias['#drizzle'] = appGate.dst
  },
})
