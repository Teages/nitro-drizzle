import NitroDrizzle from '../src/index'
import { defineConfig } from 'nitro'

export default defineConfig({
  modules: [NitroDrizzle],
  serverDir: './server',
  drizzle: {
    dialect: 'sqlite',
    driver: 'libsql',
    schemaPath: './server/db/schema.ts',
    dev: true,
    connection: {
      url: 'file:./playground.db',
    },
  },
  experimental: {
    tasks: true,
  },
})
