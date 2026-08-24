import type {} from '../augmentations'
import { useNitroHooks } from 'nitro/app'
import { defineTask } from 'nitro/task'
import { useDrizzle } from '#drizzle'
import { drizzleConfig } from '#drizzle/config'
import { pushDevSchema, resetDevSchema } from '../dev-database'

export default defineTask({
  meta: {
    name: 'db:reset',
    description: 'Reset the dev database: drop schema, re-push, re-seed',
  },
  async run() {
    if (drizzleConfig.dev !== true) {
      throw new Error('The db:reset task requires the dev database to be active.')
    }
    if (drizzleConfig.dialect !== 'postgresql' && drizzleConfig.dialect !== 'sqlite') {
      throw new Error('The db:reset task requires the dev database to be active.')
    }
    const dialect = drizzleConfig.dialect

    const { db, schema } = useDrizzle()
    await resetDevSchema(dialect, db)
    await pushDevSchema({ dialect, db, schema: schema as Record<string, unknown> })
    await useNitroHooks().callHook('drizzle:dev:seed')
    return { result: 'Dev database reset' }
  },
})
