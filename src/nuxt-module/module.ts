import type {} from '@nuxt/nitro-server'
import type { DrizzleOptions } from '../types'

import { createResolver, defineNuxtModule } from '@nuxt/kit'
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
      // An explicit `drizzle` block in nitro config takes precedence over the Nuxt module options.
      if (!config.drizzle) {
        config.drizzle = options
      }
    })

    nuxt.hook('nitro:prepare:types', ctx =>
      [
        './drizzle/hooks.d.ts',
        './drizzle/modules.d.ts',
        './drizzle/schema.d.ts',
      ]
        .forEach(path => ctx.references.push({ path: buildResolver.resolve(path) })))
  },
})
