import type { DrizzleConfigInput } from '../../src/config/types'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveDrizzleConfig, resolveDrizzleSchemaPath } from '../../src/config/resolve'

const serverDir = '/workspace/server'
const originalDatabaseUrl = process.env.DATABASE_URL

afterEach(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL
    return
  }
  process.env.DATABASE_URL = originalDatabaseUrl
})

describe('resolveDrizzleConfig', () => {
  it('resolves a single schema entry from the project root', () => {
    expect(resolveDrizzleSchemaPath(
      './server/db/schema.ts',
      'sqlite',
      '/workspace',
    )).toBe('/workspace/server/db/schema.ts')
  })

  it('selects exactly one schema entry for the configured dialect', () => {
    expect(resolveDrizzleSchemaPath(
      {
        sqlite: './schema.sqlite.ts',
        postgresql: './schema.postgresql.ts',
      },
      'postgresql',
      '/workspace',
    )).toBe('/workspace/schema.postgresql.ts')
  })

  it('rejects a dialect map without the configured dialect', () => {
    expect(() => resolveDrizzleSchemaPath(
      { sqlite: './schema.sqlite.ts' },
      'mysql',
      '/workspace',
    )).toThrow(/No schemaPath configured for Drizzle dialect "mysql"/)
  })

  it('returns undefined when config is absent', () => {
    // Given
    const config = undefined

    // When
    const resolved = resolveDrizzleConfig(config, { serverDir: false })

    // Then
    expect(resolved).toBeUndefined()
  })

  it('applies explicit defaults for a valid config', () => {
    // Given
    const config: DrizzleConfigInput = {
      dialect: 'sqlite',
      driver: 'libsql',
      connection: { url: 'file:database.db' },
    }

    // When
    const resolved = resolveDrizzleConfig(config, { serverDir })

    // Then
    expect(resolved).toEqual({
      dialect: 'sqlite',
      driver: 'libsql',
      connection: { url: 'file:database.db' },
      migrationsDir: join(serverDir, 'db/migrations/sqlite'),
    })
  })

  it('does not require driver and dialect to match', () => {
    // Given
    const config: DrizzleConfigInput = {
      dialect: 'sqlite',
      driver: 'postgres-js',
    }

    // When
    const resolved = resolveDrizzleConfig(config, { serverDir })

    // Then
    expect(resolved).toMatchObject(config)
  })

  it('preserves explicit paths and connection values', () => {
    // Given
    const config: DrizzleConfigInput = {
      dialect: 'postgresql',
      driver: 'postgres-js',
      connection: {
        url: 'postgres://localhost/database',
        prepare: false,
      },
      migrationsDir: '/custom/migrations',
    }

    // When
    const resolved = resolveDrizzleConfig(config, { serverDir })

    // Then
    expect(resolved).toEqual(config)
  })

  it('passes extra connection options through', () => {
    // Given
    const connection = {
      host: 'localhost',
      port: 5432,
      ssl: { rejectUnauthorized: false },
    }

    // When
    const resolved = resolveDrizzleConfig(
      {
        dialect: 'postgresql',
        driver: 'postgres-js',
        connection,
      },
      { serverDir },
    )

    // Then
    expect(resolved?.connection).toEqual(connection)
  })

  it('does not inspect database environment variables', () => {
    // Given
    process.env.DATABASE_URL = 'postgres://environment/database'
    const config: DrizzleConfigInput = {
      dialect: 'postgresql',
      driver: 'pglite',
    }

    // When
    const resolved = resolveDrizzleConfig(config, { serverDir })

    // Then
    expect(resolved?.driver).toBe('pglite')
    expect(resolved?.connection).toBeUndefined()
  })

  it('omits migrationsDir when the server directory is disabled', () => {
    // Given
    const config: DrizzleConfigInput = {
      dialect: 'sqlite',
      driver: 'libsql',
    }

    // When
    const resolved = resolveDrizzleConfig(config, { serverDir: false })

    // Then
    expect(resolved?.migrationsDir).toBeUndefined()
  })

  it('accepts an explicit migrations directory when the server directory is disabled', () => {
    // Given
    const migrationsDir = '/workspace/migrations'

    // When
    const resolved = resolveDrizzleConfig(
      {
        dialect: 'sqlite',
        driver: 'libsql',
        migrationsDir,
      },
      { serverDir: false },
    )

    // Then
    expect(resolved?.migrationsDir).toBe(migrationsDir)
  })
})
