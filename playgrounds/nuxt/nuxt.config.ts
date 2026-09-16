import { fileURLToPath } from 'node:url'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['../../src/nuxt'],
  alias: {
    '@teages/nitro-drizzle/runtime': fileURLToPath(new URL('../../src/runtime', import.meta.url)),
  },

  drizzle: {
    dialect: 'sqlite',
    driver: 'libsql',
    schemaPath: './server/db/schema.ts',
    devMock: true,
    connection: {
      url: 'file:./playground.db',
    },
  },
})
