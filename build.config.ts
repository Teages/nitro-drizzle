import { defineBuildConfig } from 'obuild/config'

export default defineBuildConfig({
  entries: [
    {
      type: 'bundle',
      input: [
        './src/index.ts',
        './src/nuxt.ts',
        './src/types.ts',
        './src/config.ts',
        './src/devtool.ts',
      ],
      rolldown: { external: ['@nuxt/schema'] },
      dts: { build: true },
    },
    {
      type: 'bundle',
      input: [
        './src/runtime/configuration/connection.ts',
        './src/runtime/middleware/drizzle-gate.ts',
        './src/runtime/middleware/studio-gate.ts',
        './src/runtime/plugins/drizzle.ts',
        './src/runtime/routes/_drizzle/studio.ts',
      ],
      dts: false,
    },
  ],
})
