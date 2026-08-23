import { describe, expect, it } from 'vitest'
import { createSerializableDrizzleConfig } from '../../src/codegen/emit'
import { resolveDrizzleConfig } from '../../src/config/resolve'

describe('createSerializableDrizzleConfig', () => {
  it('removes secrets from serialized Drizzle configuration', () => {
    const config = resolveDrizzleConfig({
      dialect: 'sqlite',
      driver: 'd1-http',
      connection: {
        accountId: 'account',
        apiToken: 'CANARY_D1_SECRET',
        databaseId: 'database',
      },
    }, { serverDir: '/server' })
    expect(config).toBeDefined()
    if (config === undefined) {
      return
    }

    const runtimeConfig = createSerializableDrizzleConfig(config)
    const serialized = JSON.stringify(runtimeConfig)

    expect(serialized).not.toContain('CANARY_D1_SECRET')
    expect(serialized).toContain('"databaseId":"database"')
    expect(runtimeConfig).toMatchObject({
      connection: {
        apiToken: '',
        connectionString: '',
        password: '',
        url: '',
      },
    })
  })

  it('preserves typed non-secret connection fields', () => {
    const config = resolveDrizzleConfig({
      dialect: 'postgresql',
      driver: 'pglite',
      connection: {
        prepare: false,
        dataDir: '/tmp/pglite',
      },
    }, { serverDir: '/server' })
    expect(config).toBeDefined()
    if (config === undefined) {
      return
    }

    const runtimeConfig = createSerializableDrizzleConfig(config)

    expect(runtimeConfig.connection?.prepare).toBe(false)
    expect(runtimeConfig.connection?.dataDir).toBe('/tmp/pglite')
  })
})
