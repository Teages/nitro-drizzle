import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createNitro } from 'nitro/builder'
import { afterEach, describe, expect, it } from 'vitest'
import NitroDrizzle from '../../src'

const temporaryDirectories: string[] = []

function virtualSource(
  nitro: Awaited<ReturnType<typeof createNitro>>,
  id: string,
): string {
  const source = nitro.options.virtual[id]
  if (typeof source !== 'function') {
    return source ?? ''
  }
  const generated = source()
  if (typeof generated !== 'string') {
    throw new TypeError(`Expected ${id} to generate synchronously.`)
  }
  return generated
}

async function createTemporaryRoot(): Promise<string> {
  const rootDir = await mkdtemp(join(process.cwd(), '.test-drizzle-module-'))
  temporaryDirectories.push(rootDir)
  const serverDbDir = join(rootDir, 'server/db')
  await mkdir(serverDbDir, { recursive: true })
  await writeFile(
    join(serverDbDir, 'schema.ts'),
    `import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
})
`,
  )
  return rootDir
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(path =>
      rm(path, { recursive: true, force: true }),
    ),
  )
})

describe('@teages/nitro-drizzle', () => {
  it('exports the Nitro module', () => {
    // Given
    const moduleName = '@teages/nitro-drizzle'

    // When
    const module = NitroDrizzle

    // Then
    expect(module.name).toBe(moduleName)
  })

  it('rejects projects with serverDir disabled', async () => {
    // Given
    const rootDir = await createTemporaryRoot()

    // When
    const creation = createNitro({
      rootDir,
      serverDir: false,
      buildDir: './node_modules/.nitro',
      modules: [NitroDrizzle],
      drizzle: {
        dialect: 'sqlite',
        driver: 'libsql',
        schemaPath: './server/db/schema.ts',
      },
    })

    // Then
    await expect(creation).rejects.toThrow(
      '@teages/nitro-drizzle requires Nitro serverDir to be enabled.',
    )
  })

  it('maps a configured relations export in the virtual schema', async () => {
    // Given
    const rootDir = await createTemporaryRoot()

    // When
    const nitro = await createNitro({
      rootDir,
      serverDir: './server',
      buildDir: './node_modules/.nitro',
      modules: [NitroDrizzle],
      drizzle: {
        dialect: 'sqlite',
        driver: 'libsql',
        schemaPath: './server/db/schema.ts',
        relationsExport: 'appRelations',
      },
    })

    // Then
    expect(virtualSource(nitro, '#drizzle/schema')).toContain(
      '["appRelations"]: relations',
    )
    await nitro.close()
  })

  it('rejects d1 without the experimental async context flag', async () => {
    // Given
    const rootDir = await createTemporaryRoot()

    // When
    const creation = createNitro({
      rootDir,
      serverDir: './server',
      buildDir: './node_modules/.nitro',
      modules: [NitroDrizzle],
      drizzle: { dialect: 'sqlite', driver: 'd1', schemaPath: './server/db/schema.ts' },
    })

    // Then
    await expect(creation).rejects.toThrow(/experimental\.asyncContext/)
    await creation.catch(() => {})
  })

  it('accepts d1 when the user enables the experimental async context flag', async () => {
    // Given
    const rootDir = await createTemporaryRoot()

    // When
    const nitro = await createNitro({
      rootDir,
      serverDir: './server',
      buildDir: './node_modules/.nitro',
      modules: [NitroDrizzle],
      drizzle: { dialect: 'sqlite', driver: 'd1', schemaPath: './server/db/schema.ts' },
      experimental: { asyncContext: true },
    })

    // Then
    expect(virtualSource(nitro, '#drizzle')).toContain('__nitroDrizzleD1Db')
    await nitro.close()
  })

  it('merges user runtimeConfig connection defaults instead of clobbering them', async () => {
    // Given
    const rootDir = await createTemporaryRoot()

    // When
    const nitro = await createNitro({
      rootDir,
      serverDir: './server',
      buildDir: './node_modules/.nitro',
      modules: [NitroDrizzle],
      drizzle: { dialect: 'sqlite', driver: 'libsql', schemaPath: './server/db/schema.ts' },
      runtimeConfig: {
        drizzle: { connection: { url: 'file:custom.db', host: 'static-host' } },
      },
    })

    // Then
    const runtime = nitro.options.runtimeConfig.drizzle
    expect(runtime?.connection).toEqual({
      ...{
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
      },
      url: 'file:custom.db',
      host: 'static-host',
    })
    expect(runtime?.driver).toBe('libsql')
    expect(runtime?.migrationsDir).toBe(
      join(nitro.options.buildDir, 'drizzle/runtime-assets/migrations'),
    )
    expect(virtualSource(nitro, '#drizzle')).toContain('export function useDrizzle()')
    await nitro.close()
  })

  it('does not bake environment credentials into runtimeConfig defaults', async () => {
    // Given
    const rootDir = await createTemporaryRoot()
    const previousUrl = process.env.NITRO_DRIZZLE_CONNECTION_URL
    process.env.NITRO_DRIZZLE_CONNECTION_URL = 'libsql://from-env'

    try {
      // When
      const nitro = await createNitro({
        rootDir,
        serverDir: './server',
        buildDir: './node_modules/.nitro',
        modules: [NitroDrizzle],
        drizzle: { dialect: 'sqlite', driver: 'libsql', schemaPath: './server/db/schema.ts' },
        runtimeConfig: {
          drizzle: { connection: { url: 'file:custom.db' } },
        },
      })

      // Then
      expect(nitro.options.runtimeConfig.drizzle?.connection?.url)
        .toBe('file:custom.db')
      await nitro.close()
    }
    finally {
      if (previousUrl === undefined) {
        delete process.env.NITRO_DRIZZLE_CONNECTION_URL
      }
      else {
        process.env.NITRO_DRIZZLE_CONNECTION_URL = previousUrl
      }
    }
  })

  it('activates the dev database in dev mode and keeps the toolchain on the real database', async () => {
    // Given
    const rootDir = await createTemporaryRoot()

    // When
    const nitro = await createNitro({
      rootDir,
      serverDir: './server',
      buildDir: './node_modules/.nitro',
      dev: true,
      modules: [NitroDrizzle],
      drizzle: {
        dialect: 'postgresql',
        driver: 'postgres-js',
        schemaPath: './server/db/schema.ts',
        dev: { driver: 'pglite' },
      },
    })

    // Then — the runtime client switches to the dev engine with a baked memory connection
    const virtual = virtualSource(nitro, '#drizzle')
    expect(virtual).toContain(`from 'drizzle-orm/pglite'`)
    expect(virtual).not.toContain('drizzle-orm/postgres-js')
    expect(virtual).not.toContain('useRuntimeConfig')

    // And — the schema imports its explicit entry through a virtual module so
    // the host bundler owns the complete dependency graph
    expect(virtual).toContain(`from '#drizzle/schema'`)
    expect(virtualSource(nitro, '#drizzle/schema'))
      .toContain(join(rootDir, 'server/db/schema.ts'))

    // And — the runtime subpath resolves straight to the virtual module so
    // its dist re-export cannot go stale in Vite's dev module graph
    expect(nitro.options.alias['@teages/nitro-drizzle/runtime'])
      .toBe('#drizzle')

    // And — no custom directory watcher is added
    expect(nitro.options.devServer.watch).toEqual([])

    // And — runtime config flags the dev database while keeping the real driver
    const runtime = nitro.options.runtimeConfig.drizzle
    expect(runtime?.dev).toBe(true)
    expect(runtime?.driver).toBe('postgres-js')

    // And — the generated types follow the dev engine
    const modules = await readFile(
      join(nitro.options.buildDir, 'drizzle/modules.d.ts'),
      'utf8',
    )
    expect(modules).toContain('drizzle-orm/pglite')

    // And — the dev plugin and reset task are registered
    expect(nitro.options.plugins).toContainEqual(
      expect.stringContaining('runtime/plugins/dev-db'),
    )
    expect(nitro.options.tasks['db:reset']?.handler)
      .toContain('runtime/tasks/reset')
    expect(nitro.options.noExternals).toContain('@teages/nitro-drizzle')
    await nitro.close()
  })

  it('merges its runtime package into an existing noExternals list', async () => {
    // Given
    const rootDir = await createTemporaryRoot()

    // When
    const nitro = await createNitro({
      rootDir,
      serverDir: './server',
      buildDir: './node_modules/.nitro',
      modules: [NitroDrizzle],
      noExternals: ['user-runtime'],
      drizzle: {
        dialect: 'sqlite',
        driver: 'node-sqlite',
        schemaPath: './server/db/schema.ts',
      },
    })

    // Then
    expect(nitro.options.noExternals).toEqual([
      'user-runtime',
      '@teages/nitro-drizzle',
    ])
    await nitro.close()
  })

  it('preserves noExternals true', async () => {
    // Given
    const rootDir = await createTemporaryRoot()

    // When
    const nitro = await createNitro({
      rootDir,
      serverDir: './server',
      buildDir: './node_modules/.nitro',
      modules: [NitroDrizzle],
      noExternals: true,
      drizzle: {
        dialect: 'sqlite',
        driver: 'node-sqlite',
        schemaPath: './server/db/schema.ts',
      },
    })

    // Then
    expect(nitro.options.noExternals).toBe(true)
    await nitro.close()
  })

  it('leaves explicit schema HMR to the vite builder', async () => {
    // Given
    const rootDir = await createTemporaryRoot()
    const nitro = await createNitro({
      rootDir,
      serverDir: './server',
      buildDir: './node_modules/.nitro',
      dev: true,
      builder: 'vite',
      modules: [NitroDrizzle],
      drizzle: { dialect: 'sqlite', driver: 'libsql', schemaPath: './server/db/schema.ts' },
    })

    // Then — the explicit entry is part of Vite's normal module graph
    expect(nitro.options.devServer.watch).toEqual([])
    await nitro.close()
  })

  it('ignores the dev database outside dev mode', async () => {
    // Given
    const rootDir = await createTemporaryRoot()

    // When
    const nitro = await createNitro({
      rootDir,
      serverDir: './server',
      buildDir: './node_modules/.nitro',
      modules: [NitroDrizzle],
      drizzle: {
        dialect: 'postgresql',
        driver: 'postgres-js',
        schemaPath: './server/db/schema.ts',
        dev: { driver: 'pglite' },
      },
    })

    // Then
    expect(nitro.options.runtimeConfig.drizzle?.dev).toBeUndefined()
    expect(virtualSource(nitro, '#drizzle'))
      .toContain(`from 'drizzle-orm/postgres-js'`)
    expect(nitro.options.virtual['#drizzle/schema']).toBeDefined()
    expect(nitro.options.alias['@teages/nitro-drizzle/runtime']).toBeUndefined()
    expect(nitro.options.plugins).not.toContainEqual(
      expect.stringContaining('runtime/plugins/dev-db'),
    )
    expect(nitro.options.tasks['db:reset']).toBeUndefined()
    await nitro.close()
  })

  it('disables the dev database via NITRO_DRIZZLE_DEV=false', async () => {
    // Given
    const rootDir = await createTemporaryRoot()
    const previous = process.env.NITRO_DRIZZLE_DEV
    process.env.NITRO_DRIZZLE_DEV = 'false'

    try {
      // When
      const nitro = await createNitro({
        rootDir,
        serverDir: './server',
        buildDir: './node_modules/.nitro',
        dev: true,
        modules: [NitroDrizzle],
        drizzle: {
          dialect: 'postgresql',
          driver: 'postgres-js',
          schemaPath: './server/db/schema.ts',
          dev: { driver: 'pglite' },
        },
      })

      // Then
      expect(nitro.options.runtimeConfig.drizzle?.dev).toBeUndefined()
      expect(virtualSource(nitro, '#drizzle'))
        .toContain(`from 'drizzle-orm/postgres-js'`)
      await nitro.close()
    }
    finally {
      if (previous === undefined) {
        delete process.env.NITRO_DRIZZLE_DEV
      }
      else {
        process.env.NITRO_DRIZZLE_DEV = previous
      }
    }
  })

  it('rejects the dev database for the mysql dialect', async () => {
    // Given
    const rootDir = await createTemporaryRoot()

    // When
    const creation = createNitro({
      rootDir,
      serverDir: './server',
      buildDir: './node_modules/.nitro',
      dev: true,
      modules: [NitroDrizzle],
      drizzle: {
        dialect: 'mysql',
        driver: 'mysql2',
        schemaPath: './server/db/schema.ts',
        dev: true,
      },
    })

    // Then
    await expect(creation).rejects.toThrow(/does not support the dev database/)
    await creation.catch(() => {})
  })
})
