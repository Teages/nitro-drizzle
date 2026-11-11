import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    // Public ABI facades: each entry becomes `dist/<name>.mjs` + `.d.mts`,
    // the files the package exports map points at.
    entry: {
      index: 'src/index.ts',
      nuxt: 'src/nuxt.ts',
      types: 'src/types.ts',
      config: 'src/config.ts',
      devtool: 'src/devtool.ts',
    },
    format: ['esm'],
    platform: 'node',
    outDir: 'dist',
    // Keep shared chunks out of the entry namespace, with stable names.
    hash: false,
    outputOptions: {
      chunkFileNames: '_chunks/[name].mjs',
    },
    deps: {
      neverBundle: ['@nuxt/schema'],
    },
    // The root tsconfig only holds project references, which the declaration
    // build cannot use; tsconfig.node.json is the emit-ready module config and
    // already excludes the runtime tree.
    dts: { tsconfig: './tsconfig.node.json' },
    // Package-level validation runs after the build, so keep it in CI where
    // the packed tarball is exactly what gets published.
    publint: 'ci-only',
    attw: { enabled: 'ci-only', level: 'error', profile: 'esm-only' },
    clean: true,
  },
  {
    // Runtime tree: Nitro loads these files individually (`./runtime/*`
    // export), so they ship one-to-one, mirroring src/runtime.
    entry: ['src/runtime/**/*.ts', '!src/runtime/**/*.d.ts'],
    root: 'src/runtime',
    unbundle: true,
    format: ['esm'],
    platform: 'node',
    outDir: 'dist/runtime',
    deps: {
      // Virtual modules provided by the Nitro module at app build time.
      neverBundle: ['#drizzle', '#drizzle/config'],
    },
    dts: false,
    treeshake: false,
    clean: false,
  },
])
