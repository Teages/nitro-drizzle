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
    outExtensions: () => ({ js: '.mjs', dts: '.d.mts' }),
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
    outExtensions: () => ({ js: '.mjs' }),
    deps: {
      // Virtual modules provided by the Nitro module at app build time.
      neverBundle: ['#drizzle', '#drizzle/config'],
    },
    dts: false,
    treeshake: false,
    clean: false,
  },
])
