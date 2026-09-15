import { definePlugin } from 'nitro'
import { useDrizzle } from '#drizzle'
import { drizzleConfig } from '#drizzle/config'
import { DEV_DATABASE_CONFIG_HOOK, DEV_DATABASE_SEED_HOOK, DEV_DATABASE_SETUP_HOOK } from '../contracts'
import { pushDevSchema } from './push-schema'

/**
 * Payload the `drizzle:dev-mock:config` hook receives, derived from the
 * generated hooks declaration so the plugin relays exactly what handlers
 * and the engine's `drizzle()` call agree on.
 */
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
    // The config hook mutates the exact object the engine's drizzle() call
    // receives: the dev module's builder memoizes its config, so the
    // handlers and the later construction share one object. An in-memory
    // pglite bakes no connection at all, so its config carries no
    // `connection` key until a handler adds one.
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
