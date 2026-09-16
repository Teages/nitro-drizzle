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
      type: 'transform',
      input: 'src/runtime',
      filter: path => !path.endsWith('.d.ts'),
      outDir: 'dist/runtime',
      dts: false,
    },
  ],
})
