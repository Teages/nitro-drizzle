// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['../../src/nuxt'],

  drizzle: {
    dialect: 'sqlite',
    driver: 'libsql',
    schemaPath: './server/db/schema.ts',
    devMock: {
      studio: {
        port: 4983,
      },
    },
    connection: {
      url: 'file:./playground.db',
    },
  },
})
