import { defineConfig } from 'nitro'
import NitroDrizzle from '../../../../src/index'

export default defineConfig({
  modules: [NitroDrizzle],
  serverDir: './server',
  buildDir: './.nitro',

  // use createNitro to config it
  // drizzle: {},
  drizzle: {
    dialect: 'sqlite',
    driver: 'better-sqlite3',
    schemaPath: './server/db/schema.sqlite.ts',
    migrationsDir: './server/db/migrations/sqlite',
    devMock: true,
  },
})
