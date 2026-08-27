import { describe, expect, it } from 'vitest'
import { expandNitroEnv, findEnvTemplateKeys } from '../../src/config/env'

describe('expandNitroEnv', () => {
  it('expands {{VAR}} templates in string values when enabled', () => {
    const connection = expandNitroEnv(
      { url: '{{DATABASE_URL}}', host: '{{DB_HOST}}:5432' },
      { env: { DATABASE_URL: 'postgres://db', DB_HOST: 'db.internal' }, envExpansion: true },
    )
    expect(connection.url).toBe('postgres://db')
    expect(connection.host).toBe('db.internal:5432')
  })

  it('keeps literal {{VAR}} when the variable is missing or empty', () => {
    const connection = expandNitroEnv(
      { url: '{{DATABASE_URL}}', host: '{{DB_HOST}}' },
      { env: { DB_HOST: '' }, envExpansion: true },
    )
    expect(connection.url).toBe('{{DATABASE_URL}}')
    expect(connection.host).toBe('{{DB_HOST}}')
  })

  it('does not expand templates when envExpansion is disabled', () => {
    const connection = expandNitroEnv(
      { url: '{{DATABASE_URL}}' },
      { env: { DATABASE_URL: 'postgres://db' }, envExpansion: false },
    )
    expect(connection.url).toBe('{{DATABASE_URL}}')
  })

  it('returns the input as-is when expansion is disabled', () => {
    const input = { url: '{{DATABASE_URL}}' }
    expect(expandNitroEnv(input, { env: {}, envExpansion: false })).toBe(input)
  })

  it('ignores NITRO_DRIZZLE_CONNECTION_* environment variables', () => {
    const connection = expandNitroEnv(
      { url: 'file:default.db' },
      { env: { NITRO_DRIZZLE_CONNECTION_URL: 'libsql://override' }, envExpansion: true },
    )
    expect(connection.url).toBe('file:default.db')
  })

  it('expands templates inside nested object values', () => {
    const connection = expandNitroEnv(
      { options: { url: '{{DATABASE_URL}}' }, port: 5432 },
      { env: { DATABASE_URL: 'postgres://db' }, envExpansion: true },
    )
    expect(connection.options).toEqual({ url: 'postgres://db' })
    expect(connection.port).toBe(5432)
  })

  it('does not mutate the input connection', () => {
    const input = { url: '{{DATABASE_URL}}' }
    expandNitroEnv(input, { env: { DATABASE_URL: 'postgres://db' }, envExpansion: true })
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
