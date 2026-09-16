import { definePlugin } from 'nitro'
import { useDrizzle } from '#drizzle'
import { drizzleConfig } from '#drizzle/config'
import { pushDevSchema } from '../dev-database/push-schema'
import { bindDrizzleReady } from '../lifecycle'

/** Config-hook payload, from the generated hooks declaration. */
type DrizzleRuntimeConfig = Parameters<
  import('nitro/types').NitroRuntimeHooks['drizzle:config']
>[0]

/** The lazy `#drizzle` variants expose their memoized drizzle config. */
interface DrizzleModule {
  drizzleConfig?: () => DrizzleRuntimeConfig
}

export default definePlugin((nitro) => {
  const ready = (async () => {
    // Variants that construct from a config object expose a memoized
    // builder; client-built variants (d1) have none and skip the hook.
    const module = await import('#drizzle') as unknown as DrizzleModule
    const config = module.drizzleConfig?.()
    if (config !== undefined) {
      await nitro.hooks.callHook('drizzle:config', config)
    }

    if (drizzleConfig.devMock !== true) {
      return
    }
    if (drizzleConfig.dialect !== 'postgresql' && drizzleConfig.dialect !== 'sqlite') {
      return
    }
    const { mockDb, schema } = useDrizzle()
    if (mockDb === undefined) {
      throw new Error('The dev database client exposes no mockDb handle.')
    }
    await nitro.hooks.callHook('drizzle:dev-mock:setup', mockDb.$client)
    await pushDevSchema({ dialect: drizzleConfig.dialect, db: mockDb, schema: schema as Record<string, unknown> })
    await nitro.hooks.callHook('drizzle:dev-mock:seed')
  })()
  bindDrizzleReady(ready)
  ready.catch((error) => {
    console.error(
      'Failed to initialize the drizzle database:',
      error,
    )
  })
})
