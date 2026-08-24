import { defineTask } from 'nitro/task'
import { drizzleConfig, useDrizzleConnection } from '#drizzle/config'
import { resolveDrizzleConfig } from '../../config/resolve'
import { createAndApplyDrizzleMigrations } from '../../migrations/apply'
import { resolveRuntimeMigrationsFolder } from '../../migrations/runtime-paths'

export default defineTask({
  meta: {
    name: 'db:migrate',
    description: 'Apply Drizzle database migrations',
  },
  async run() {
    const config = resolveDrizzleConfig(
      { ...drizzleConfig, connection: useDrizzleConnection() },
      { serverDir: false },
    )
    if (config === undefined) {
      throw new Error('Drizzle is not configured.')
    }

    const result = await createAndApplyDrizzleMigrations({
      config,
      migrationsFolder: await resolveRuntimeMigrationsFolder(config),
    })
    if (!result.ok) {
      throw result.error
    }
    return { result: 'Migrations applied' }
  },
})
