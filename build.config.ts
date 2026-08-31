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
        './src/configuration/runtime/connection.ts',
        './src/dev-database/runtime/plugin.ts',
        './src/studio/runtime/plugin.ts',
        './src/studio/runtime/handler.ts',
      ],
      dts: false,
    },
  ],
})
