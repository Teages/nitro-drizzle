import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DrizzleConfigError,
  loadDrizzleConfig,
} from '../../src/config'

const temporaryDirectories: string[] = []

interface Fixture {
  readonly rootDir: string
  readonly serverDir: string
  readonly schemaPath: string
  readonly relationsPath: string
}

interface FixtureOptions {
  /** Object literal body for the `drizzle` option (without connection). */
  readonly drizzle?: string
  readonly connection?: string
  readonly experimental?: string
}

async function createFixture(
  options: FixtureOptions = {},
): Promise<Fixture> {
  const rootDir = await mkdtemp(join(process.cwd(), '.test-drizzle-loader-'))
  temporaryDirectories.push(rootDir)
  const serverDir = join(rootDir, 'server')
  const databaseDir = join(serverDir, 'db')
  await mkdir(databaseDir, { recursive: true })
  const schemaPath = join(databaseDir, 'schema.ts')
  const relationsPath = join(databaseDir, 'relations.ts')
  const drizzleBody = options.drizzle
    ?? `{ dialect: 'sqlite', driver: 'libsql', schemaPath: './server/db/schema.ts' }`
  const drizzleWithConnection = drizzleBody.replace(
    /\}\s*$/,
    `,\n  connection: ${options.connection ?? '{ url: \'file:./test.db\' }'},\n}`,
  )
  await Promise.all([
    writeFile(
      schemaPath,
      'export const users = { table: "users" }\nexport { relations } from "./relations"\n',
    ),
    writeFile(relationsPath, 'export const relations = { users: {} }\n'),
    writeFile(
      join(rootDir, 'nitro.config.ts'),
      `import { defineConfig } from 'nitro/config'

export default defineConfig({
  serverDir: './server',
  drizzle: ${drizzleWithConnection},
  ${options.experimental === undefined ? '' : `experimental: ${options.experimental},`}
})
`,
    ),
  ])
  return { rootDir, serverDir, schemaPath, relationsPath }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(path =>
      rm(path, { recursive: true, force: true }),
    ),
  )
})

describe('loadDrizzleConfig', () => {
  it('builds the config from the Nitro config with static connection defaults', async () => {
    const fixture = await createFixture()

    const config = await loadDrizzleConfig({ cwd: fixture.rootDir })

    expect(config.dialect).toBe('turso')
    expect(config.schema).toEqual([fixture.schemaPath])
    expect(config.out).toBe(join(fixture.serverDir, 'db/migrations/sqlite'))
    expect('dbCredentials' in config ? config.dbCredentials : undefined).toEqual({
      url: 'file:./test.db',
    })
  })

  it('ignores NITRO_DRIZZLE_CONNECTION_* environment variables', async () => {
    const fixture = await createFixture()
    const previous = process.env.NITRO_DRIZZLE_CONNECTION_URL
    process.env.NITRO_DRIZZLE_CONNECTION_URL = 'file:./override.db'
    try {
      const config = await loadDrizzleConfig({ cwd: fixture.rootDir })
      expect('dbCredentials' in config ? config.dbCredentials : undefined).toEqual({
        url: 'file:./test.db',
      })
    }
    finally {
      if (previous === undefined) {
        delete process.env.NITRO_DRIZZLE_CONNECTION_URL
      }
      else {
        process.env.NITRO_DRIZZLE_CONNECTION_URL = previous
      }
    }
  })

  it('keeps a non-empty libSQL auth token', async () => {
    const fixture = await createFixture({
      connection: `{ url: 'libsql://database.turso.io', authToken: 'secret' }`,
    })

    const config = await loadDrizzleConfig({ cwd: fixture.rootDir })

    expect('dbCredentials' in config ? config.dbCredentials : undefined).toEqual({
      url: 'libsql://database.turso.io',
      authToken: 'secret',
    })
  })

  it('expands {{VAR}} connection templates when envExpansion is enabled', async () => {
    const fixture = await createFixture({
      connection: `{ url: '{{TEST_LOADER_DATABASE_URL}}' }`,
      experimental: '{ envExpansion: true }',
    })
    const previous = process.env.TEST_LOADER_DATABASE_URL
    process.env.TEST_LOADER_DATABASE_URL = 'libsql://expanded'
    try {
      const config = await loadDrizzleConfig({ cwd: fixture.rootDir })
      expect('dbCredentials' in config ? config.dbCredentials : undefined).toEqual({
        url: 'libsql://expanded',
      })
    }
    finally {
      if (previous === undefined) {
        delete process.env.TEST_LOADER_DATABASE_URL
      }
      else {
        process.env.TEST_LOADER_DATABASE_URL = previous
      }
    }
  })

  it('keeps {{VAR}} literals when envExpansion is disabled', async () => {
    const fixture = await createFixture({
      connection: `{ url: '{{TEST_LOADER_DATABASE_URL}}' }`,
    })
    const previous = process.env.TEST_LOADER_DATABASE_URL
    process.env.TEST_LOADER_DATABASE_URL = 'libsql://expanded'
    try {
      const config = await loadDrizzleConfig({ cwd: fixture.rootDir })
      expect('dbCredentials' in config ? config.dbCredentials : undefined).toEqual({
        url: '{{TEST_LOADER_DATABASE_URL}}',
      })
    }
    finally {
      if (previous === undefined) {
        delete process.env.TEST_LOADER_DATABASE_URL
      }
      else {
        process.env.TEST_LOADER_DATABASE_URL = previous
      }
    }
  })

  it('coerces an expanded templated port to a number for drizzle-kit', async () => {
    const fixture = await createFixture({
      drizzle: '{ dialect: \'postgresql\', driver: \'postgres-js\', schemaPath: \'./server/db/schema.ts\' }',
      connection: '{ host: \'db.local\', port: \'{{TEST_LOADER_DB_PORT}}\', user: \'app\', password: \'secret\', database: \'app\' }',
      experimental: '{ envExpansion: true }',
    })
    const previous = process.env.TEST_LOADER_DB_PORT
    process.env.TEST_LOADER_DB_PORT = '5432'
    try {
      const config = await loadDrizzleConfig({ cwd: fixture.rootDir })
      expect('dbCredentials' in config ? config.dbCredentials : undefined).toMatchObject({
        port: 5432,
      })
    }
    finally {
      if (previous === undefined) {
        delete process.env.TEST_LOADER_DB_PORT
      }
      else {
        process.env.TEST_LOADER_DB_PORT = previous
      }
    }
  })

  it('keeps drizzle-kit pointed at the explicit schema entry', async () => {
    const fixture = await createFixture()
    const extraPath = join(fixture.serverDir, 'db', 'schema', 'posts.ts')
    await mkdir(join(fixture.serverDir, 'db', 'schema'), { recursive: true })
    await writeFile(extraPath, 'export const posts = { table: "posts" }\n')
    await writeFile(
      fixture.schemaPath,
      'export const users = { table: "renamed" }\n',
    )

    const config = await loadDrizzleConfig({ cwd: fixture.rootDir })

    expect(config.schema).toEqual([fixture.schemaPath])
  })

  it('fails when the Nitro config has no drizzle dialect and driver', async () => {
    const rootDir = await mkdtemp(join(process.cwd(), '.test-drizzle-loader-'))
    temporaryDirectories.push(rootDir)
    await writeFile(
      join(rootDir, 'nitro.config.ts'),
      `import { defineConfig } from 'nitro/config'

export default defineConfig({})
`,
    )

    await expect(
      loadDrizzleConfig({ cwd: rootDir }),
    ).rejects.toThrow(DrizzleConfigError)
  })

  it('fails when schemaPath is not configured', async () => {
    const rootDir = await mkdtemp(join(process.cwd(), '.test-drizzle-loader-'))
    temporaryDirectories.push(rootDir)
    await mkdir(join(rootDir, 'server'), { recursive: true })
    await writeFile(
      join(rootDir, 'nitro.config.ts'),
      `import { defineConfig } from 'nitro/config'

export default defineConfig({
  serverDir: './server',
  drizzle: { dialect: 'sqlite', driver: 'libsql' },
})
`,
    )

    await expect(
      loadDrizzleConfig({ cwd: rootDir }),
    ).rejects.toMatchObject({
      name: 'DrizzleConfigError',
      message: expect.stringMatching(/No schemaPath configured/),
    })
  })

  it('maps pglite onto the required driver form with the dataDir first', async () => {
    const fixture = await createFixture({
      drizzle: `{ dialect: 'postgresql', driver: 'pglite', schemaPath: {
        sqlite: './server/db/schema.sqlite.ts',
        postgresql: './server/db/schema.ts',
      } }`,
      connection: '{ dataDir: \'/tmp/pg-data\', url: \'file:ignored.db\' }',
    })

    const config = await loadDrizzleConfig({ cwd: fixture.rootDir })

    expect(config.dialect).toBe('postgresql')
    expect(config.schema).toEqual([fixture.schemaPath])
    expect('driver' in config ? config.driver : undefined).toBe('pglite')
    expect(config.out).toBe(join(fixture.serverDir, 'db/migrations/postgresql'))
    expect('dbCredentials' in config ? config.dbCredentials : undefined).toEqual({
      url: '/tmp/pg-data',
    })
  })

  it('maps d1-http credentials onto the HTTP driver form', async () => {
    const fixture = await createFixture({
      drizzle: '{ dialect: \'sqlite\', driver: \'d1-http\', schemaPath: \'./server/db/schema.ts\' }',
      connection: '{ accountId: \'account\', databaseId: \'database\', apiToken: \'token\' }',
    })

    const config = await loadDrizzleConfig({ cwd: fixture.rootDir })

    expect(config.dialect).toBe('sqlite')
    expect('driver' in config ? config.driver : undefined).toBe('d1-http')
    expect('dbCredentials' in config ? config.dbCredentials : undefined).toEqual({
      accountId: 'account',
      databaseId: 'database',
      token: 'token',
    })
  })

  it('routes the binding d1 driver through the d1-http form', async () => {
    const fixture = await createFixture({
      drizzle: '{ dialect: \'sqlite\', driver: \'d1\', schemaPath: \'./server/db/schema.ts\' }',
      connection: '{ accountId: \'account\', databaseId: \'database\', apiToken: \'token\' }',
    })

    const config = await loadDrizzleConfig({ cwd: fixture.rootDir })

    expect('driver' in config ? config.driver : undefined).toBe('d1-http')
    expect('dbCredentials' in config ? config.dbCredentials : undefined).toEqual({
      accountId: 'account',
      databaseId: 'database',
      token: 'token',
    })
  })

  it('falls back to host credentials when no postgres url is set', async () => {
    const fixture = await createFixture({
      drizzle: '{ dialect: \'postgresql\', driver: \'postgres-js\', schemaPath: \'./server/db/schema.ts\' }',
      connection: '{ host: \'db.local\', port: 5432, user: \'app\', password: \'secret\', database: \'app\' }',
    })

    const config = await loadDrizzleConfig({ cwd: fixture.rootDir })

    expect(config.dialect).toBe('postgresql')
    expect('driver' in config).toBe(false)
    expect('dbCredentials' in config ? config.dbCredentials : undefined).toEqual({
      host: 'db.local',
      port: 5432,
      user: 'app',
      password: 'secret',
      database: 'app',
    })
  })
})
