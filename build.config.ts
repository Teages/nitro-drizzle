import { defineBuildConfig } from 'obuild/config'

export default defineBuildConfig({
  entries: [
    './src/index.ts',
    './src/nuxt.ts',
    './src/config.ts',
    './src/configuration/runtime/connection.ts',
    './src/dev-database/runtime/plugin.ts',
    './src/studio/runtime/plugin.ts',
    './src/studio/runtime/handler.ts',
  ].map(input => ({
    type: 'bundle' as const,
    input,
    // The root tsconfig uses project references; the default isolated dts
    // pass cannot follow them.
    dts: { build: true },
  })),
  hooks: {
    // The Nuxt entry must share the @nuxt/kit singleton of the host Nuxt
    // process — a bundled copy loses access to the Nuxt instance context.
    // These are devDependencies, so obuild does not externalize them itself.
    rolldownConfig(config) {
      const { external } = config
      const base: readonly (string | RegExp)[]
        = Array.isArray(external)
          ? external
          : external === undefined || typeof external === 'function' ? [] : [external]
      config.external = [
        ...base,
        '@nuxt/kit',
        '@nuxt/schema',
        '@nuxt/nitro-server',
        /^@nuxt\/kit\//,
        /^@nuxt\/schema\//,
        /^@nuxt\/nitro-server\//,
      ]
    },
  },
})
