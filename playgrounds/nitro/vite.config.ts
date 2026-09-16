import { fileURLToPath } from 'node:url'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    nitro(),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@teages/nitro-drizzle/runtime': fileURLToPath(new URL('../../src/runtime', import.meta.url)),
    },
  },
})
