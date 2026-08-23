import type {} from '../augmentations'
import { useNitroHooks } from 'nitro/app'
import { useRuntimeConfig } from 'nitro/runtime-config'
import { defineTask } from 'nitro/task'
import { useDrizzle } from '#drizzle'
import { pushDevSchema, resetDevSchema } from '../dev-database'

export default defineTask({
  meta: {
    name: 'db:reset',
    description: 'Reset the dev database: drop schema, re-push, re-seed',
  },
  async run() {
    const config = useRuntimeConfig().drizzle
    if (config === undefined || config.dev !== true) {
      throw new Error('The db:reset task requires the dev database to be active.')
    }
    if (config.dialect !== 'postgresql' && config.dialect !== 'sqlite') {
      throw new Error('The db:reset task requires the dev database to be active.')
    }
    const dialect = config.dialect

    const { db, schema } = useDrizzle()
    await resetDevSchema(dialect, db)
    await pushDevSchema({ dialect, db, schema: schema as Record<string, unknown> })
    await useNitroHooks().callHook('drizzle:dev:seed')
    return { result: 'Dev database reset' }
  },
})
