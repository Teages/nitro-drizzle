import { defineBuildConfig } from 'obuild/config'

export default defineBuildConfig({
  entries: [
    './src/index.ts',
    './src/config/index.ts',
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
})
