import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    // Public ABI facades: entry names are the `exports` subpaths, so each one
    // lands at `dist/<name>.mjs` + `.d.mts`.
    entry: {
      index: 'src/index.ts',
      nuxt: 'src/nuxt.ts',
      types: 'src/types.ts',
      config: 'src/config.ts',
      devtool: 'src/devtool.ts',
    },
    deps: {
      // Load-bearing for the declaration build: without it the dts plugin
      // tries to bundle @nuxt/schema's transitive types and fails on their
      // CommonJS declaration syntax.
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
  },
  {
    // Runtime tree: Nitro loads these files individually through the
    // `./runtime/*` export, so they ship one-to-one, mirroring src/runtime.
    entry: ['src/runtime/**/*.ts', '!src/runtime/**/*.d.ts'],
    unbundle: true,
    outDir: 'dist/runtime',
    deps: {
      // Virtual modules provided by the Nitro module at app build time.
      neverBundle: [/^#drizzle/],
    },
    // Declarations are auto-enabled by the `types` conditions in `exports`;
    // the runtime tree ships as source-typed JS only.
    dts: false,
  },
])
