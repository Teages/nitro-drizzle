import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      nuxt: 'src/nuxt.ts',
      types: 'src/types.ts',
      config: 'src/config.ts',
      devtool: 'src/devtool.ts',
    },
    deps: {
      neverBundle: ['@nuxt/schema'],
    },
    dts: { tsconfig: './tsconfig.node.json' },
    exports: {
      devExports: true,
      customExports(exports, { isPublish }) {
        exports['./runtime/*'] = isPublish
          ? './dist/runtime/*.mjs'
          : './src/runtime/*.ts'
        return exports
      },
    },
    publint: 'ci-only',
    attw: { enabled: 'ci-only', level: 'error', profile: 'esm-only' },
  },
  {
    entry: ['src/runtime/**/*.ts', '!src/runtime/**/*.d.ts'],
    unbundle: true,
    outDir: 'dist/runtime',
    deps: {
      neverBundle: [/^#drizzle/],
    },
    dts: false,
  },
])
