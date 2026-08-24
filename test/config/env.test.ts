import { describe, expect, it } from 'vitest'
import { applyNitroEnv, findEnvTemplateKeys } from '../../src/config/env'

describe('applyNitroEnv', () => {
  it('applies NITRO_DRIZZLE_CONNECTION_* overrides to defined keys only', () => {
    const connection = applyNitroEnv(
      { url: 'file:default.db', host: 'localhost' },
      { env: { NITRO_DRIZZLE_CONNECTION_URL: 'libsql://from-env' }, envExpansion: false },
    )
    expect(connection).toEqual({ url: 'libsql://from-env', host: 'localhost' })
  })

  it('honors the alternative prefix', () => {
    const connection = applyNitroEnv(
      { url: 'file:default.db' },
      { env: { _DRIZZLE_CONNECTION_URL: 'libsql://alt' }, envExpansion: false },
    )
    expect(connection.url).toBe('libsql://alt')
  })

  it('prefers the configured envPrefix over the NITRO_ENV_PREFIX variable', () => {
    const connection = applyNitroEnv(
      { url: 'file:default.db' },
      {
        env: { NITRO_ENV_PREFIX: 'FROM_ENV_', APP_DRIZZLE_CONNECTION_URL: 'libsql://app' },
        envPrefix: 'APP_',
        envExpansion: false,
      },
    )
    expect(connection.url).toBe('libsql://app')
  })

  it('expands {{VAR}} templates in string values when enabled', () => {
    const connection = applyNitroEnv(
      { url: '{{DATABASE_URL}}', host: '{{DB_HOST}}:5432' },
      { env: { DATABASE_URL: 'postgres://db', DB_HOST: 'db.internal' }, envExpansion: true },
    )
    expect(connection.url).toBe('postgres://db')
    expect(connection.host).toBe('db.internal:5432')
  })

  it('keeps literal {{VAR}} when the variable is missing or empty', () => {
    const connection = applyNitroEnv(
      { url: '{{DATABASE_URL}}', host: '{{DB_HOST}}' },
      { env: { DB_HOST: '' }, envExpansion: true },
    )
    expect(connection.url).toBe('{{DATABASE_URL}}')
    expect(connection.host).toBe('{{DB_HOST}}')
  })

  it('does not expand templates when envExpansion is disabled', () => {
    const connection = applyNitroEnv(
      { url: '{{DATABASE_URL}}' },
      { env: { DATABASE_URL: 'postgres://db' }, envExpansion: false },
    )
    expect(connection.url).toBe('{{DATABASE_URL}}')
  })

  it('lets a NITRO_ override win over the expanded template', () => {
    const connection = applyNitroEnv(
      { url: '{{DATABASE_URL}}' },
      {
        env: {
          DATABASE_URL: 'postgres://from-template',
          NITRO_DRIZZLE_CONNECTION_URL: 'postgres://from-override',
        },
        envExpansion: true,
      },
    )
    expect(connection.url).toBe('postgres://from-override')
  })

  it('replaces non-string values wholesale, matching Nitro semantics', () => {
    const connection = applyNitroEnv(
      { port: 5432, prepare: false },
      { env: { NITRO_DRIZZLE_CONNECTION_PORT: '6543' }, envExpansion: true },
    )
    expect(connection).toEqual({ port: '6543', prepare: false })
  })

  it('does not mutate the input connection', () => {
    const input = { url: '{{DATABASE_URL}}' }
    applyNitroEnv(input, { env: { DATABASE_URL: 'postgres://db' }, envExpansion: true })
    expect(input.url).toBe('{{DATABASE_URL}}')
  })
})

describe('findEnvTemplateKeys', () => {
  it('collects unique template names from string values', () => {
    const keys = findEnvTemplateKeys({
      url: '{{DATABASE_URL}}',
      host: '{{DB_HOST}} {{DB_HOST}}',
      port: 5432,
    })
    expect([...keys].sort()).toEqual(['DATABASE_URL', 'DB_HOST'])
  })

  it('returns an empty list without templates', () => {
    expect(findEnvTemplateKeys({ url: 'file:default.db', port: 0 })).toEqual([])
  })
})
