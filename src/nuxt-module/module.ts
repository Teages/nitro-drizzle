import type {} from '@nuxt/nitro-server'
import type { DrizzleOptions } from '../types'

import { join } from 'node:path'
import { env } from 'node:process'
import { addTemplate, addVitePlugin, defineNuxtModule, logger } from '@nuxt/kit'
import { DEV_ENV_FLAG } from '../dev-database/resolve'
import drizzleDevtool from '../devtool'
import { resolveDrizzleModuleContext } from '../nitro-module/context'
import DrizzleModule from '../nitro-module/module'
import { generateDrizzleArtifacts } from '../schema-artifacts/generate'

const DRIZZLE_TYPE_ARTIFACTS = [
  'hooks.d.ts',
  'modules.d.ts',
  'schema.d.ts',
]

export default defineNuxtModule<DrizzleOptions>({
  meta: {
    name: '@teages/nitro-drizzle',
    configKey: 'drizzle',
  },
  async setup(options, nuxt) {
    nuxt.hook('nitro:config', (config) => {
      config.modules ??= []
      config.modules.push(DrizzleModule)
      if (config.drizzle) {
        logger.warn('drizzle config in `nitro.drizzle` will be ignored')
      }
      // Nuxt owns the type lifecycle: the nitro module must not write
      // declarations at its own setup — the type hooks below generate them
      // into Nuxt's buildDir when Nuxt prepares types.
      config.drizzle = { ...options, typesDir: false }
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

    // The declarations generate into `<buildDir>/drizzle` — the directory
    // both the nitro types and the app tsconfig projects reference, so
    // `#drizzle` types infer across environments. Both hooks generate:
    // whichever fires first creates the files ahead of its own references,
    // and the write itself is idempotent.
    const typesDir = join(nuxt.options.buildDir, 'drizzle')
    const generateTypes = async (): Promise<void> => {
      const ctx = await resolveDrizzleModuleContext({
        drizzle: options,
        rootDir: nuxt.options.rootDir,
        serverDir: nuxt.options.serverDir,
        dev: nuxt.options.dev,
      })
      if (ctx === undefined) {
        return
      }
      await generateDrizzleArtifacts({
        directory: typesDir,
        config: ctx.config,
        schemaPath: ctx.schemaPath,
        ...(ctx.relationsExport === undefined ? {} : { relationsExport: ctx.relationsExport }),
        ...(ctx.devDb?.engine === undefined ? {} : { clientDriver: ctx.devDb.engine }),
      })
    }
    nuxt.hook('nitro:prepare:types', async (ctx) => {
      await generateTypes()
      DRIZZLE_TYPE_ARTIFACTS.forEach(path =>
        ctx.references.push({ path: join(typesDir, path) }))
    })
    nuxt.hook('prepare:types', async (ctx) => {
      await generateTypes()
      DRIZZLE_TYPE_ARTIFACTS.forEach(path =>
        ctx.references.push({ path: join(typesDir, path) }))
    })

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
