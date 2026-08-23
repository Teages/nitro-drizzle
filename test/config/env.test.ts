import { describe, expect, it } from 'vitest'
import {
  emptyConnectionDefaults,
  resolveConnectionFromEnv,
  resolveDrizzleEnvPrefixes,
} from '../../src/config/env'

describe('resolveDrizzleEnvPrefixes', () => {
  it('defaults to the NITRO_ prefix and underscore alternative', () => {
    expect(resolveDrizzleEnvPrefixes(undefined, {})).toEqual(['NITRO_', '_'])
  })

  it('follows the configured nitro env prefix', () => {
    expect(resolveDrizzleEnvPrefixes('NUITRO_', {})).toEqual([
      'NITRO_',
      'NUITRO_',
    ])
  })

  it('falls back to the NITRO_ENV_PREFIX variable', () => {
    expect(
      resolveDrizzleEnvPrefixes(undefined, { NITRO_ENV_PREFIX: 'APP_' }),
    ).toEqual(['NITRO_', 'APP_'])
  })
})

describe('resolveConnectionFromEnv', () => {
  it('maps snake-cased keys onto connection fields', () => {
    expect(
      resolveConnectionFromEnv(
        {
          NITRO_DRIZZLE_CONNECTION_URL: 'libsql://db',
          NITRO_DRIZZLE_CONNECTION_AUTH_TOKEN: 'token',
          NITRO_DRIZZLE_CONNECTION_HYPERDRIVE_ID: 'hyperdrive',
          _DRIZZLE_CONNECTION_HOST: 'localhost',
        },
        ['NITRO_', '_'],
      ),
    ).toEqual({
      url: 'libsql://db',
      authToken: 'token',
      hyperdriveId: 'hyperdrive',
      host: 'localhost',
    })
  })

  it('skips empty env values so static defaults survive', () => {
    expect(
      resolveConnectionFromEnv(
        { NITRO_DRIZZLE_CONNECTION_URL: '' },
        ['NITRO_'],
        { url: 'file:default.db' },
      ),
    ).toEqual({ url: 'file:default.db' })
  })

  it('lets env values win over static defaults', () => {
    expect(
      resolveConnectionFromEnv(
        { NITRO_DRIZZLE_CONNECTION_PASSWORD: 'from-env' },
        ['NITRO_', '_'],
        { user: 'static-user', password: 'static-password' },
      ),
    ).toEqual({ user: 'static-user', password: 'from-env' })
  })

  it('parses port as a number', () => {
    expect(
      resolveConnectionFromEnv(
        { NITRO_DRIZZLE_CONNECTION_PORT: '5433' },
        ['NITRO_', '_'],
      ).port,
    ).toBe(5433)
  })

  it('rejects non-numeric port values', () => {
    expect(() =>
      resolveConnectionFromEnv(
        { NITRO_DRIZZLE_CONNECTION_PORT: 'http' },
        ['NITRO_', '_'],
      ),
    ).toThrow(/DRIZZLE_CONNECTION_PORT/)
  })
})

describe('emptyConnectionDefaults', () => {
  it('covers every env-overridable key with falsy defaults', () => {
    expect(emptyConnectionDefaults()).toEqual({
      url: '',
      uri: '',
      authToken: '',
      connectionString: '',
      host: '',
      port: 0,
      user: '',
      password: '',
      database: '',
      accountId: '',
      apiToken: '',
      databaseId: '',
      hyperdriveId: '',
      dataDir: '',
    })
  })
})
