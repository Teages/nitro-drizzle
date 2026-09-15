import { definePlugin } from 'nitro'
import { useDrizzle } from '#drizzle'
import { drizzleConfig } from '#drizzle/config'
import { DEV_DATABASE_CONFIG_HOOK, DEV_DATABASE_SEED_HOOK, DEV_DATABASE_SETUP_HOOK } from '../contracts'
import { pushDevSchema } from './push-schema'

/** Config-hook payload, from the generated hooks declaration. */
type DevDrizzleConfig = Parameters<
  import('nitro/types').NitroRuntimeHooks[typeof DEV_DATABASE_CONFIG_HOOK]
>[0]

/** The dev variant of `#drizzle` exposes its memoized drizzle config. */
interface DevDrizzleModule {
  devDrizzleConfig?: () => DevDrizzleConfig
}

export default definePlugin((nitro) => {
  if (drizzleConfig.devMock !== true) {
    return
  }
  if (drizzleConfig.dialect !== 'postgresql' && drizzleConfig.dialect !== 'sqlite') {
    return
  }
  const dialect = drizzleConfig.dialect

  const ready = (async () => {
    const devClient = await import('#drizzle') as unknown as DevDrizzleModule
    const config = devClient.devDrizzleConfig?.()
    if (config !== undefined) {
      await nitro.hooks.callHook(DEV_DATABASE_CONFIG_HOOK, config)
    }
    const { mockDb, schema } = useDrizzle()
    if (mockDb === undefined) {
      throw new Error('The dev database client exposes no mockDb handle.')
    }
    await nitro.hooks.callHook(DEV_DATABASE_SETUP_HOOK, mockDb.$client)
    await pushDevSchema({ dialect, db: mockDb, schema: schema as Record<string, unknown> })
    await nitro.hooks.callHook(DEV_DATABASE_SEED_HOOK)
  })()
  ready.catch((error) => {
    console.error(
      'Failed to initialize the dev database:',
      error,
    )
  })

  nitro.hooks.hook('request', async () => {
    await ready
  })
})
