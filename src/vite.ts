import type {} from 'nitro/vite'
import type { Plugin, PluginOption } from 'vite'
import type { DrizzleConfigInput } from './config/types'
import type { DrizzleOptions } from './types'
import module from './index'

// Declared inline on the entry: bundlers drop side-effect-only type imports
// when generating the shipped declarations, which would strip these
// augmentations from dist. Vite-plugin consumers never import the package
// root, so this entry needs its own copy (structure-identical with the one
// in `src/index.ts`; TypeScript merges the two interfaces).
declare module 'nitro/types' {
  interface NitroOptions {
    drizzle?: DrizzleOptions
  }

  interface NitroRuntimeConfig {
    drizzle?: DrizzleConfigInput
  }
}

/**
 * Vite plugin flavor of the Nitro module. The explicit schema entry stays in
 * Vite's module graph, so the host dev server owns its HMR lifecycle. Drizzle
 * options passed here are applied to the Nitro config.
 */
export default function NitroDrizzle(options?: DrizzleOptions): PluginOption {
  const plugins: Plugin[] = []

  if (options) {
    plugins.push({
      name: '@teages/nitro-drizzle/options',
      nitro: {
        setup(nitro) {
          nitro.options.drizzle = options
        },
      },
    })
  }

  plugins.push({
    name: '@teages/nitro-drizzle',
    nitro: module,
  })
  return plugins
}
