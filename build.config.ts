import { defineBuildConfig } from 'obuild/config'

export default defineBuildConfig({
  entries: [
    './src/index.ts',
    './src/config/loader.ts',
    './src/configuration/runtime/connection.ts',
    './src/runtime/plugins/dev-db.ts',
    './src/runtime/plugins/studio.ts',
    './src/runtime/studio/handler.ts',
  ].map(input => ({
    type: 'bundle' as const,
    input,
    // The root tsconfig uses project references; the default isolated dts
    // pass cannot follow them.
    dts: { build: true },
  })),
})
