import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveDrizzleConfig } from '../../../src/configuration/resolve'
import { generateDrizzleArtifacts } from '../../../src/schema-artifacts/generate'

const execFileAsync = promisify(execFile)
const temporaryDirectories: string[] = []

async function createTemporaryRoot(): Promise<string> {
  const rootDir = await mkdtemp(join(process.cwd(), '.test-drizzle-types-'))
  temporaryDirectories.push(rootDir)
  return rootDir
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(path =>
      rm(path, { recursive: true, force: true }),
    ),
  )
})

describe('generated Drizzle types', () => {
  it('declares a typed useDrizzle backed by emitted schema types', async () => {
    // Given
    const rootDir = await createTemporaryRoot()
    const serverDir = join(rootDir, 'server')
    const databaseDir = join(serverDir, 'db')
    await mkdir(databaseDir, { recursive: true })
    const schemaPath = join(databaseDir, 'schema.ts')
    await writeFile(
      schemaPath,
      `import { defineRelations } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
})

export const appRelations = defineRelations({ users })
`,
    )
    const config = resolveDrizzleConfig(
      {
        dialect: 'sqlite',
        driver: 'libsql',
        connection: { url: 'file:database.db' },
      },
      { serverDir },
    )
    expect(config).toBeDefined()
    if (config === undefined) {
      return
    }

    // When
    const artifacts = await generateDrizzleArtifacts({
      directory: join(rootDir, 'node_modules/.nitro-drizzle'),
      config,
      schemaPath,
      relationsExport: 'appRelations',
    })
    const consumerFile = join(rootDir, 'consumer.ts')
    const tsconfigFile = join(rootDir, 'tsconfig.json')
    await Promise.all([
      writeFile(
        consumerFile,
        `import {
  relations,
  schema,
  useDrizzle,
  type DrizzleContext,
} from '#drizzle'

schema.users.id
relations.users

const context: DrizzleContext = useDrizzle()
context.db.query.users.findMany()
`,
      ),
      writeFile(
        tsconfigFile,
        JSON.stringify({
          compilerOptions: {
            module: 'ESNext',
            moduleResolution: 'Bundler',
            noEmit: true,
            skipLibCheck: true,
            strict: true,
          },
          include: [
            consumerFile,
            artifacts.schemaTypesFile,
            artifacts.modulesFile,
          ],
        }),
      ),
    ])

    // Then
    const modulesDeclaration = await readFile(artifacts.modulesFile, 'utf8')
    expect(modulesDeclaration).toContain(`declare module '#drizzle'`)
    // The schema reference must resolve to the emitted schema.d.ts sitting
    // next to this declaration — a bare './schema' fails tsc with TS2307,
    // and the README-documented tsconfig include (`**/*.d.ts`) must pick
    // the file up without an extra glob.
    expect(modulesDeclaration).toContain(
      `typeof import('./schema.d.ts')`,
    )
    expect(modulesDeclaration).toContain('drizzle-orm/libsql')
    // Without a configured devMock the context exposes no mock database
    expect(modulesDeclaration).toContain('readonly mockDb: undefined')
    expect(modulesDeclaration).not.toContain('MockDatabase')
    expect(modulesDeclaration).toContain('export function useDrizzle(): DrizzleContext')
    await expect(
      execFileAsync(
        join(process.cwd(), 'node_modules/.bin/tsc'),
        ['--project', tsconfigFile],
      ),
    ).resolves.toBeDefined()
  })

  it('types mockDb from the configured dev engine while db keeps the configured driver', async () => {
    // Given
    const rootDir = await createTemporaryRoot()
    const schemaPath = join(rootDir, 'schema.ts')
    await writeFile(
      schemaPath,
      `import { defineRelations } from 'drizzle-orm'
import { integer, pgTable, text } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
})

export const relations = defineRelations({ users })
`,
    )
    const config = resolveDrizzleConfig(
      {
        dialect: 'postgresql',
        driver: 'postgres-js',
        connection: { connectionString: 'postgres://localhost/database' },
      },
      { serverDir: join(rootDir, 'server') },
    )
    expect(config).toBeDefined()
    if (config === undefined) {
      return
    }

    // When the declarations are generated for a pglite dev mock
    const artifacts = await generateDrizzleArtifacts({
      directory: join(rootDir, 'node_modules/.nitro-drizzle'),
      config,
      schemaPath,
      mockEngine: 'pglite',
    })
    const consumerFile = join(rootDir, 'consumer.ts')
    const tsconfigFile = join(rootDir, 'tsconfig.json')
    await Promise.all([
      writeFile(
        consumerFile,
        `import { useDrizzle, type DrizzleContext } from '#drizzle'

const context: DrizzleContext = useDrizzle()
context.db.query.users.findMany()

const mock = context.mockDb
if (mock) {
  // Engine-specific access: the dev mock runs on PGlite, so the client
  // narrows to the PGlite instance only after the undefined guard
  const client: import('@electric-sql/pglite').PGlite = mock.$client
  client.query('select 1')
}
`,
      ),
      writeFile(
        tsconfigFile,
        JSON.stringify({
          compilerOptions: {
            module: 'ESNext',
            moduleResolution: 'Bundler',
            noEmit: true,
            skipLibCheck: true,
            strict: true,
          },
          include: [
            consumerFile,
            artifacts.schemaTypesFile,
            artifacts.modulesFile,
          ],
        }),
      ),
    ])

    // Then the declarations keep the configured driver for db and type
    // mockDb from the dev engine
    const modulesDeclaration = await readFile(artifacts.modulesFile, 'utf8')
    expect(modulesDeclaration).toContain('drizzle-orm/postgres-js')
    expect(modulesDeclaration).toContain(
      `typeof import("drizzle-orm/pglite").drizzle<`,
    )
    expect(modulesDeclaration).toContain('readonly mockDb: MockDatabase | undefined')
    // And the consumer typechecks: db stays postgres-js, mockDb narrows to pglite
    await expect(
      execFileAsync(
        join(process.cwd(), 'node_modules/.bin/tsc'),
        ['--project', tsconfigFile],
      ),
    ).resolves.toBeDefined()
  })

  it('declares the drizzle:dev-mock:seed runtime hook for server code', async () => {
    // Given
    const rootDir = await createTemporaryRoot()
    const schemaPath = join(rootDir, 'schema.ts')
    await writeFile(schemaPath, 'export const users = {}\n')
    const config = resolveDrizzleConfig(
      {
        dialect: 'sqlite',
        driver: 'libsql',
        connection: { url: 'file:database.db' },
      },
      { serverDir: join(rootDir, 'server') },
    )
    expect(config).toBeDefined()
    if (config === undefined) {
      return
    }
    const artifacts = await generateDrizzleArtifacts({
      directory: join(rootDir, 'node_modules/.nitro-drizzle'),
      config,
      schemaPath,
    })

    const hooksDeclaration = await readFile(artifacts.hooksFile, 'utf8')
    expect(hooksDeclaration).toContain(`declare module 'nitro/types'`)
    expect(hooksDeclaration).toContain(`'drizzle:dev-mock:seed': () => void | Promise<void>`)

    const consumerFile = join(rootDir, 'plugin.ts')
    const tsconfigFile = join(rootDir, 'tsconfig.json')
    await Promise.all([
      writeFile(
        consumerFile,
        `import { useNitroHooks } from 'nitro/app'

useNitroHooks().hook('drizzle:dev-mock:seed', async () => {
  console.log('seeded')
})
`,
      ),
      writeFile(
        tsconfigFile,
        JSON.stringify({
          compilerOptions: {
            module: 'ESNext',
            moduleResolution: 'Bundler',
            noEmit: true,
            skipLibCheck: true,
            strict: true,
          },
          include: [consumerFile, artifacts.hooksFile],
        }),
      ),
    ])

    // Then: the hook name only typechecks when the generated declaration
    // augments NitroRuntimeHooks.
    await expect(
      execFileAsync(
        join(process.cwd(), 'node_modules/.bin/tsc'),
        ['--project', tsconfigFile],
      ),
    ).resolves.toBeDefined()
  })
})
