import type {} from '../augmentations'
import { consola } from 'consola'
import { definePlugin } from 'nitro'
import { useRuntimeConfig } from 'nitro/runtime-config'
import { useDrizzle } from '#drizzle'
import { pushDevSchema } from '../dev-database'

export default definePlugin((nitro) => {
  const config = useRuntimeConfig().drizzle
  if (config === undefined || config.dev !== true) {
    return
  }
  if (config.dialect !== 'postgresql' && config.dialect !== 'sqlite') {
    return
  }
  const dialect = config.dialect

  const ready = (async () => {
    const { db, schema } = useDrizzle()
    await pushDevSchema({ dialect, db, schema: schema as Record<string, unknown> })
    await nitro.hooks.callHook('drizzle:dev:seed')
  })()
  ready.catch((error) => {
    consola.withTag('@teages/nitro-drizzle/dev').error(
      'Failed to initialize the dev database:',
      error,
    )
  })

  nitro.hooks.hook('request', async () => {
    await ready
  })
})
