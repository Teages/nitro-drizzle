import type { DrizzleDriverConfig } from '../../../src/contracts/driver'
import type { DrizzleOptions } from '../../../src/contracts/public'
import { describe, expect, it } from 'vitest'
import { generateVirtualClientSource } from '../../../src/codegen/client/generate'

const driverImports = {
  'better-sqlite3': 'drizzle-orm/better-sqlite3',
  'libsql': 'drizzle-orm/libsql',
  'bun-sqlite': 'drizzle-orm/bun-sqlite',
  'node-sqlite': 'drizzle-orm/node-sqlite',
  'd1': 'drizzle-orm/d1',
  'd1-http': 'drizzle-orm/sqlite-proxy',
  'postgres-js': 'drizzle-orm/postgres-js',
  'pglite': 'drizzle-orm/pglite',
  'neon-http': 'drizzle-orm/neon-http',
  'mysql2': 'drizzle-orm/mysql2',
} as const satisfies Record<DrizzleOptions['driver'], string>

const dialects = {
  'better-sqlite3': 'sqlite',
  'libsql': 'sqlite',
  'bun-sqlite': 'sqlite',
  'node-sqlite': 'sqlite',
  'd1': 'sqlite',
  'd1-http': 'sqlite',
  'postgres-js': 'postgresql',
  'pglite': 'postgresql',
  'neon-http': 'postgresql',
  'mysql2': 'mysql',
} as const satisfies Record<DrizzleOptions['driver'], DrizzleOptions['dialect']>

function generate(config: DrizzleDriverConfig): string {
  return generateVirtualClientSource({
    config,
    schemaImport: '#drizzle/schema',
    relationsImport: '#drizzle/relations',
  })
}

describe('generateVirtualClientSource', () => {
  const lazySingletonDrivers = [
    'better-sqlite3',
    'libsql',
    'bun-sqlite',
    'node-sqlite',
    'd1-http',
    'postgres-js',
    'pglite',
    'neon-http',
    'mysql2',
  ] as const

  for (const driver of lazySingletonDrivers) {
    it(`generates a lazy singleton useDrizzle for ${driver}`, () => {
      // Given
      const typedDriver: DrizzleOptions['driver'] = driver
      const config: DrizzleDriverConfig = {
        dialect: dialects[typedDriver],
        driver: typedDriver,
      }

      // When
      const source = generate(config)

      // Then
      expect(source).toContain(`import { drizzle } from '${driverImports[typedDriver]}'`)
      expect(source).toContain(`import { schema } from '#drizzle/schema'`)
      expect(source).toContain(`import { relations } from '#drizzle/relations'`)
      expect(source).toContain(`import { useDrizzleConnection } from '#drizzle/config'`)
      expect(source).toContain('let _db = null')
      expect(source).toContain('_db ??= initDrizzle()')
      expect(source).toContain('export function useDrizzle()')
      expect(source).toContain('return { db: _db, schema, relations }')
      expect(source).not.toContain('export const db')
      expect(source).not.toMatch(/\b(?:casing|mode)\b/)
    })
  }

  it('resolves the D1 binding per request via useRequest', () => {
    // Given
    const config: DrizzleDriverConfig = {
      dialect: 'sqlite',
      driver: 'd1',
    }

    // When
    const source = generate(config)

    // Then
    expect(source).toContain(`import { useRequest } from 'nitro/context'`)
    expect(source).toContain('.runtime.cloudflare.env.DB')
    expect(source).toContain('__nitroDrizzleD1Db')
    expect(source).toContain('export function useDrizzle()')
    expect(source).toContain('return { db: request.context.__nitroDrizzleD1Db, schema, relations }')
    expect(source).not.toContain('new Proxy')
    expect(source).not.toContain('__nitroDrizzleUseRequest')
    expect(source).not.toContain('useRuntimeConfig')
  })

  it('validates d1-http credentials on first use instead of module load', () => {
    // Given
    const config: DrizzleDriverConfig = {
      dialect: 'sqlite',
      driver: 'd1-http',
    }

    // When
    const source = generate(config)

    // Then
    expect(source).toContain('function initDrizzle()')
    expect(source).toContain('requires connection.accountId, apiToken, and databaseId')
    expect(source).toContain('AbortSignal.timeout(30000)')
    expect(source).toContain('const { accountId, apiToken, databaseId } = useDrizzleConnection()')
  })

  it('creates per-request Hyperdrive clients for postgres-js', () => {
    // Given
    const config: DrizzleDriverConfig = {
      dialect: 'postgresql',
      driver: 'postgres-js',
      connection: { hyperdriveId: 'hyperdrive-id' },
    }

    // When
    const source = generate(config)

    // Then
    expect(source).toContain(`import { useRequest } from 'nitro/context'`)
    expect(source).toContain('.runtime.cloudflare.env.POSTGRES')
    expect(source).toContain('__nitroDrizzlePostgresDb')
    expect(source).toContain('prepare: options.prepare ?? false')
    expect(source).toContain('export function useDrizzle()')
    expect(source).not.toContain('new Proxy')
  })

  it('creates per-request Hyperdrive clients for mysql2', () => {
    // Given
    const config: DrizzleDriverConfig = {
      dialect: 'mysql',
      driver: 'mysql2',
      connection: { hyperdriveId: 'hyperdrive-id' },
    }

    // When
    const source = generate(config)

    // Then
    expect(source).toContain('.runtime.cloudflare.env.MYSQL')
    expect(source).toContain('__nitroDrizzleMysqlDb')
  })

  it('does not bake static connection values into the client source', () => {
    // Given
    const config: DrizzleDriverConfig = {
      dialect: 'postgresql',
      driver: 'postgres-js',
      connection: {
        connectionString: 'postgres://localhost/database',
        databaseId: 'unrelated-d1-id',
      },
    }

    // When
    const source = generate(config)

    // Then — connection values resolve from #drizzle/config at runtime,
    // never serialized into the client source
    expect(source).toContain('useDrizzleConnection()')
    expect(source).not.toContain('postgres://localhost/database')
    expect(source).not.toContain('unrelated-d1-id')
  })

  it('does not serialize D1 HTTP credentials into generated source', () => {
    // Given
    const config: DrizzleDriverConfig = {
      dialect: 'sqlite',
      driver: 'd1-http',
      connection: {
        accountId: 'CANARY_D1_ACCOUNT',
        apiToken: 'CANARY_D1_SECRET',
        databaseId: 'CANARY_D1_DATABASE',
      },
    }

    // When
    const source = generate(config)

    // Then
    expect(source).not.toContain('CANARY_D1_SECRET')
    expect(source).not.toContain('CANARY_D1_ACCOUNT')
    expect(source).not.toContain('CANARY_D1_DATABASE')
  })

  it('does not require driver and dialect to match', () => {
    // Given
    const config: DrizzleDriverConfig = {
      dialect: 'sqlite',
      driver: 'postgres-js',
    }

    // When
    const source = generate(config)

    // Then
    expect(source).toContain(`from 'drizzle-orm/postgres-js'`)
  })

  it('combines schema and relations imported from one generated artifact', () => {
    // Given
    const config: DrizzleDriverConfig = {
      dialect: 'sqlite',
      driver: 'libsql',
    }

    // When
    const source = generateVirtualClientSource({
      config,
      schemaImport: '#drizzle/schema',
      relationsImport: '#drizzle/schema',
    })

    // Then
    expect(source).toContain(
      `import { relations, schema } from '#drizzle/schema'`,
    )
  })
})

describe('generateVirtualClientSource dev database', () => {
  it('bakes the resolved memory connection into sqlite engines', () => {
    // Given
    const config: DrizzleDriverConfig = {
      dialect: 'sqlite',
      driver: 'node-sqlite',
    }

    // When
    const source = generateVirtualClientSource({
      config,
      schemaImport: '#drizzle/schema',
      relationsImport: '#drizzle/schema',
      dev: { connection: ':memory:' },
    })

    // Then
    expect(source).toContain(`connection: ':memory:',`)
    expect(source).not.toContain('useRuntimeConfig')
  })

  it('bakes a file connection for libsql', () => {
    // Given
    const config: DrizzleDriverConfig = {
      dialect: 'sqlite',
      driver: 'libsql',
    }

    // When
    const source = generateVirtualClientSource({
      config,
      schemaImport: '#drizzle/schema',
      relationsImport: '#drizzle/schema',
      dev: { connection: 'file:.data/dev.db' },
    })

    // Then
    expect(source).toContain(`connection: { url: 'file:.data/dev.db' },`)
    expect(source).not.toContain('useRuntimeConfig')
  })

  it('omits the connection for an in-memory pglite', () => {
    // Given
    const config: DrizzleDriverConfig = {
      dialect: 'postgresql',
      driver: 'pglite',
    }

    // When
    const source = generateVirtualClientSource({
      config,
      schemaImport: '#drizzle/schema',
      relationsImport: '#drizzle/schema',
      dev: {},
    })

    // Then
    expect(source).toContain('return drizzle({\n    schema,\n    relations,\n  })')
    expect(source).not.toContain('useRuntimeConfig')
  })

  it('bakes a data directory for pglite', () => {
    // Given
    const config: DrizzleDriverConfig = {
      dialect: 'postgresql',
      driver: 'pglite',
    }

    // When
    const source = generateVirtualClientSource({
      config,
      schemaImport: '#drizzle/schema',
      relationsImport: '#drizzle/schema',
      dev: { connection: '.data/dev' },
    })

    // Then
    expect(source).toContain(`connection: '.data/dev',`)
    expect(source).not.toContain('useRuntimeConfig')
  })
})

describe('generateVirtualClientSource full output', () => {
  // The connection-aware templates were consolidated from per-driver copies;
  // these full-output snapshots lock the generated source byte for byte,
  // including import order and whitespace that substring assertions miss.
  const localEngines = [
    'better-sqlite3',
    'bun-sqlite',
    'node-sqlite',
    'libsql',
  ] as const

  const engineDialects = {
    'better-sqlite3': 'sqlite',
    'bun-sqlite': 'sqlite',
    'node-sqlite': 'sqlite',
    'libsql': 'sqlite',
    'pglite': 'postgresql',
  } as const

  for (const driver of [...localEngines, 'pglite'] as const) {
    const dialect: DrizzleOptions['dialect'] = engineDialects[driver]
    const connection
      = driver === 'pglite' ? '.data/pglite' : 'file:.data/dev.db'

    it(`snapshots the runtime-resolved source for ${driver}`, () => {
      // Given
      const config: DrizzleDriverConfig = { dialect, driver }

      // When
      const source = generateVirtualClientSource({
        config,
        schemaImport: '#drizzle/schema',
        relationsImport: '#drizzle/schema',
      })

      // Then
      expect(source).toMatchSnapshot()
    })

    it(`snapshots the dev-baked source for ${driver}`, () => {
      // Given
      const config: DrizzleDriverConfig = { dialect, driver }

      // When
      const source = generateVirtualClientSource({
        config,
        schemaImport: '#drizzle/schema',
        relationsImport: '#drizzle/schema',
        dev: { connection },
      })

      // Then
      expect(source).toMatchSnapshot()
    })
  }

  it('snapshots the dev source for an in-memory pglite', () => {
    // Given
    const config: DrizzleDriverConfig = {
      dialect: 'postgresql',
      driver: 'pglite',
    }

    // When
    const source = generateVirtualClientSource({
      config,
      schemaImport: '#drizzle/schema',
      relationsImport: '#drizzle/schema',
      dev: {},
    })

    // Then
    expect(source).toMatchSnapshot()
  })
})
