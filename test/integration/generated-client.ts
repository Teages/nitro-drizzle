import type { SQLWrapper } from 'drizzle-orm'
import type { ResolvedDrizzleConfig } from '../../src/configuration/resolve'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { sql } from 'drizzle-orm'
import { createSchemaEntry } from '../../src/schema-artifacts/schema-entry'
import { generateVirtualClientSource } from '../../src/virtual-client/generate'
import { createRuntimeConfigModule } from '../../src/virtual-client/runtime-config'

/**
 * Minimal structural view of a drizzle database. Real databases from every
 * adapter satisfy it; tests cast down to the concrete type where a driver
 * migrator needs one.
 */
export interface OpaqueDrizzleDatabase {
  readonly run?: (query: SQLWrapper | string) => unknown
  readonly execute?: (query: SQLWrapper | string) => unknown
  readonly $client?: {
    readonly end?: () => unknown
    readonly close?: () => unknown
    readonly destroy?: () => unknown
  }
}

export interface GeneratedClientModule {
  /** The generated module's own export — the exact function user code calls. */
  readonly useDrizzle: () => { readonly db: OpaqueDrizzleDatabase }
}

export interface GeneratedClientHandle extends GeneratedClientModule {
  /** Runs raw SQL through the generated db, dispatching on the dialect. */
  readonly execute: (query: string) => Promise<void>
  /** Closes the underlying driver client. */
  readonly close: () => Promise<void>
  /** Removes the generated module files. */
  readonly dispose: () => Promise<void>
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

const RUNTIME_CONNECTION_EXPORT = '@teages/nitro-drizzle/runtime/utils/configuration/connection'

/**
 * Loads the production client for a config: the exact sources
 * createDrizzleArtifactsLifecycle installs as the `#drizzle`,
 * `#drizzle/schema`, and `#drizzle/config` virtual modules, written to a
 * temporary directory with the three virtual ids rewritten to sibling files
 * and imported in-process. This is the code users run — as opposed to a
 * re-implementation of it.
 *
 * The runtime-config module's frozen package import is redirected into
 * `src/runtime` because the `@teages/nitro-drizzle` self-reference resolves
 * against `dist/`, which test runs never build.
 */
export async function loadGeneratedClient(options: {
  readonly config: ResolvedDrizzleConfig
  readonly schemaPath: string
}): Promise<GeneratedClientHandle> {
  const clientSource = generateVirtualClientSource({
    config: options.config,
    schemaImport: '#drizzle/schema',
    relationsImport: '#drizzle/schema',
  })
  const schemaSource = createSchemaEntry(options.schemaPath)
  const configSource = createRuntimeConfigModule({
    dialect: options.config.dialect,
    driver: options.config.driver,
    devMock: false,
    connection: options.config.connection ?? {},
  })

  const directory = await mkdtemp(join(repoRoot, '.test-generated-client-'))
  const runtimeConnection = relative(directory, join(repoRoot, 'src/runtime/utils/configuration/connection'))
  await writeFile(join(directory, 'schema.mjs'), schemaSource)
  await writeFile(
    join(directory, 'config.mjs'),
    configSource.replaceAll(`'${RUNTIME_CONNECTION_EXPORT}'`, `'${runtimeConnection.replaceAll('\\', '/')}'`),
  )
  await writeFile(
    join(directory, 'client.mjs'),
    clientSource
      .replaceAll('\'#drizzle/schema\'', '\'./schema.mjs\'')
      .replaceAll('\'#drizzle/config\'', '\'./config.mjs\''),
  )
  const module = await import(pathToFileURL(join(directory, 'client.mjs')).href) as GeneratedClientModule

  const method = (database: OpaqueDrizzleDatabase) =>
    options.config.dialect === 'sqlite' ? database.run : database.execute
  return {
    useDrizzle: module.useDrizzle,
    execute: async (query) => {
      const { db } = module.useDrizzle()
      const run = method(db)
      if (run === undefined) {
        throw new TypeError(
          `Drizzle database does not expose ${options.config.dialect === 'sqlite' ? 'run' : 'execute'}().`,
        )
      }
      await run.call(db, sql.raw(query))
    },
    close: async () => {
      const { $client } = module.useDrizzle().db
      const close = $client?.end ?? $client?.close ?? $client?.destroy
      await close?.call($client)
    },
    dispose: () => rm(directory, { recursive: true, force: true }),
  }
}
