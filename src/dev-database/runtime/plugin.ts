import { definePlugin } from 'nitro'
import { useDrizzle } from '#drizzle'
import { drizzleConfig } from '#drizzle/config'
import { DEV_DATABASE_CONFIG_HOOK, DEV_DATABASE_SEED_HOOK, DEV_DATABASE_SETUP_HOOK } from '../contracts'
import { pushDevSchema } from './push-schema'

/** The dev variant of `#drizzle` accepts injected construction overrides. */
interface DevDrizzleModule {
  configureDevDrizzle?: (overrides: { connection: string | object }) => void
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
    // Construction-time config: handlers replace `config.connection`, and
    // only a replaced value is injected — an untouched in-memory pglite bakes
    // no connection at all, so injecting the base `:memory:` string would
    // give it a data directory literally named `:memory:`.
    const base = drizzleConfig.devConnection ?? ':memory:'
    const config = { connection: base }
    await nitro.hooks.callHook(DEV_DATABASE_CONFIG_HOOK, config)
    if (config.connection !== base) {
      const devClient = await import('#drizzle') as unknown as DevDrizzleModule
      devClient.configureDevDrizzle?.({ connection: config.connection })
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
