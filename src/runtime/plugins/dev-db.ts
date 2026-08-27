import type {} from '../../contracts/runtime/augmentations'
import { consola } from 'consola'
import { definePlugin } from 'nitro'
import { useDrizzle } from '#drizzle'
import { drizzleConfig } from '#drizzle/config'
import { pushDevSchema } from '../dev-database'

export default definePlugin((nitro) => {
  if (drizzleConfig.devMock !== true) {
    return
  }
  if (drizzleConfig.dialect !== 'postgresql' && drizzleConfig.dialect !== 'sqlite') {
    return
  }
  const dialect = drizzleConfig.dialect

  const ready = (async () => {
    const { db, schema } = useDrizzle()
    await pushDevSchema({ dialect, db, schema: schema as Record<string, unknown> })
    await nitro.hooks.callHook('drizzle:dev-mock:seed')
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
