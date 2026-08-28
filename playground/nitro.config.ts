import { defineConfig } from 'nitro'
import NitroDrizzle from '../src/index'

export default defineConfig({
  modules: [NitroDrizzle],
  serverDir: './server',
  buildDir: './.nitro',
  drizzle: {
    dialect: 'sqlite',
    driver: 'libsql',
    schemaPath: './server/db/schema.ts',
    dev: {
      studio: {
        port: 4983,
      },
    },
    connection: {
      url: 'file:./playground.db',
    },
  },
  experimental: {
    tasks: true,
  },
})
