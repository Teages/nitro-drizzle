import { defineBuildConfig } from 'obuild/config'

export default defineBuildConfig({
  entries: [
    './src/index.ts',
    './src/config/loader.ts',
    './src/runtime/index.ts',
    './src/runtime/plugins/dev-db.ts',
    './src/runtime/tasks/migrate.ts',
    './src/runtime/tasks/reset.ts',
  ].map(input => ({
    type: 'bundle' as const,
    input,
    // The root tsconfig uses project references; the default isolated dts
    // pass cannot follow them.
    dts: { build: true },
  })),
})
