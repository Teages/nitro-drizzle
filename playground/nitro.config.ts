import { defineConfig } from 'nitro'

export default defineConfig({
  serverDir: './server',
  drizzle: {
    dialect: 'sqlite',
    driver: 'libsql',
    schemaPath: './server/db/schema.ts',
    dev: true,
  },
  runtimeConfig: {
    drizzle: {
      connection: {
        url: 'file:./playground.db',
      },
    },
  },
  experimental: {
    tasks: true,
  },
})
