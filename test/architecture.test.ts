import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createNitro } from 'nitro/builder'
import { afterEach, describe, expect, it } from 'vitest'
import buildConfig from '../build.config'
import NitroDrizzle from '../src'
import { createRuntimeHooksDeclaration } from '../src/schema-artifacts/runtime-hooks-declaration'
import { DEVTOOLS_KEY_MARKER, STUDIO_AUTH_KEY_MARKER, STUDIO_ROUTE } from '../src/studio/contracts'

const CONNECTION_ALIAS_KEY = '@teages/nitro-drizzle/runtime/connection'
const CONNECTION_IMPORT = `import { resolveDrizzleConnection } from '${CONNECTION_ALIAS_KEY}'`
const CONFIG_HOOK = 'drizzle:config'
const SETUP_HOOK = 'drizzle:dev-mock:setup'
const SEED_HOOK = 'drizzle:dev-mock:seed'

const temporaryDirectories: string[] = []

/** Accepts the extensionless specifiers Nitro registers for source builds. */
function moduleFileExists(specifier: string): boolean {
  return existsSync(specifier)
    || existsSync(`${specifier}.ts`)
    || existsSync(`${specifier}.mjs`)
}

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
  const rootDir = await mkdtemp(join(process.cwd(), '.test-drizzle-architecture-'))
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

describe('package surface', () => {
  it('exposes exactly the five public entries with a default condition', async () => {
    // Given — the published contract consumed by nitro.config.ts loading
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      exports: Record<string, Record<string, string>>
      typesVersions: { '*': Record<string, string[]> }
    }

    // Then — jiti reloads nitro.config.ts through CJS require.resolve, which
    // throws ERR_PACKAGE_PATH_NOT_EXPORTED without the default condition
    expect(Object.keys(packageJson.exports)).toEqual(['.', './nuxt', './config', './types', './devtool'])
    for (const [entry, distFile] of [['.', 'index'], ['./nuxt', 'nuxt'], ['./config', 'config'], ['./types', 'types'], ['./devtool', 'devtool']] as const) {
      expect(packageJson.exports[entry]).toEqual({
        types: `./dist/${distFile}.d.mts`,
        import: `./dist/${distFile}.mjs`,
        default: `./dist/${distFile}.mjs`,
      })
      expect(packageJson.typesVersions['*'][entry]).toEqual([
        `./dist/${distFile}.d.mts`,
      ])
    }
  })

  it('keeps @nuxt/kit as a runtime dependency, not a dev toolchain entry', async () => {
    // Given — the nuxt entry imports @nuxt/kit at runtime; without a
    // dependency entry the import rides on host hoisting and no package
    // manager enforces a compatible kit version
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    // Then
    expect(packageJson.dependencies['@nuxt/kit']).toBeDefined()
    expect(packageJson.devDependencies['@nuxt/kit']).toBeUndefined()
  })

  it('builds every obuild entry from an existing source file', () => {
    // Given — obuild mirrors src/ paths into dist/, so an entry pointing at
    // a moved file ships nothing and breaks the published runtime
    const entries = (buildConfig.entries ?? []).flatMap((entry) => {
      const input = typeof entry === 'string' ? entry : entry.input
      return typeof input === 'string' ? [input] : input
    })

    // Then — the exact entry set: the five ABI facades at their
    // dist-determining locations plus the four runtime entries
    expect([...entries].sort()).toEqual([
      './src/config.ts',
      './src/configuration/runtime/connection.ts',
      './src/devtool.ts',
      './src/index.ts',
      './src/nuxt.ts',
      './src/runtime/gate.ts',
      './src/runtime/plugin.ts',
      './src/studio/runtime/handler.ts',
      './src/studio/runtime/middleware.ts',
      './src/types.ts',
    ])
    for (const input of entries) {
      expect(existsSync(input), `${input} must exist`).toBe(true)
    }
  })
})

describe('runtime wiring', () => {
  it('pins the connection alias key and the virtual module shapes', async () => {
    // Given — a dev session with the dev database and studio enabled
    const rootDir = await createTemporaryRoot()

    // When
    const nitro = await createNitro({
      rootDir,
      serverDir: './server',
      buildDir: './node_modules/.nitro',
      dev: true,
      modules: [NitroDrizzle],
      drizzle: {
        dialect: 'sqlite',
        driver: 'node-sqlite',
        schemaPath: './server/db/schema.ts',
        devMock: true,
      },
    })

    // Then — the frozen import in the generated #drizzle/config and the
    // alias key registered at build time are the same string; only the
    // alias target may change
    expect(virtualSource(nitro, '#drizzle/config')).toContain(CONNECTION_IMPORT)
    const aliasTarget = nitro.options.alias[CONNECTION_ALIAS_KEY]
    expect(aliasTarget, 'alias key must be registered').toBeTypeOf('string')
    expect(moduleFileExists(aliasTarget), `${aliasTarget} must resolve to a file`).toBe(true)

    // And — the virtual modules keep their export shapes
    expect(virtualSource(nitro, '#drizzle')).toContain('export function useDrizzle()')
    expect(virtualSource(nitro, '#drizzle')).toContain(`import { relations, schema } from '#drizzle/schema'`)
    // And — the dev variant hands the runtime plugin the config object the
    // engine's drizzle() call receives: the memoized builder ships only in
    // dev-database sessions, so handlers and drizzle() share one object
    expect(virtualSource(nitro, '#drizzle')).toContain('export function drizzleConfig()')
    expect(virtualSource(nitro, '#drizzle')).toContain('return _config ??= {')
    expect(virtualSource(nitro, '#drizzle')).toContain('drizzle(drizzleConfig())')
    expect(virtualSource(nitro, '#drizzle/schema'))
      .toContain('export const { ["relations"]: relations = {}, ...schema } = source')
    expect(virtualSource(nitro, '#drizzle/config')).toContain('export const drizzleConfig = {')
    expect(virtualSource(nitro, '#drizzle/config')).toContain('export function useDrizzleConnection()')

    // And — the dev-database plugin is registered, the studio route carries
    // its host-gating middleware, and every registered plugin, handler, and
    // route exists on disk
    const registered = nitro.options.plugins.find(plugin =>
      plugin.replaceAll('\\', '/').endsWith('runtime/plugin'))
    expect(registered, 'runtime/plugin must be registered').toBeDefined()
    for (const plugin of nitro.options.plugins) {
      expect(moduleFileExists(plugin), `${plugin} must resolve to a file`).toBe(true)
    }
    const rootMiddlewares = nitro.options.handlers.filter(handler =>
      handler.route === '/**' && handler.middleware === true)
    const readyGate = rootMiddlewares.find(handler =>
      handler.handler.replaceAll('\\', '/').endsWith('runtime/gate'))
    expect(readyGate, 'runtime/gate middleware must be registered').toBeDefined()
    const studioGate = rootMiddlewares.find(handler =>
      handler.handler.replaceAll('\\', '/').endsWith('studio/runtime/middleware'))
    expect(studioGate?.handler.replaceAll('\\', '/')).toMatch(/studio\/runtime\/middleware$/)
    expect(moduleFileExists(studioGate?.handler ?? '')).toBe(true)
    const studioRoute = nitro.options.routes[STUDIO_ROUTE]
    if (typeof studioRoute === 'string' || studioRoute === undefined) {
      throw new Error(`Expected ${STUDIO_ROUTE} to be a handler object.`)
    }
    expect(studioRoute.handler.replaceAll('\\', '/')).toMatch(/studio\/runtime\/handler$/)
    expect(moduleFileExists(studioRoute.handler)).toBe(true)

    // And — the externalization escapes survive any file move
    expect(nitro.options.noExternals).toContain('@teages/nitro-drizzle')
    expect(nitro.options.traceDeps).toContain('drizzle-orm*')
    expect(nitro.options.replace[STUDIO_AUTH_KEY_MARKER]).toBeTypeOf('string')
    // And — without the `devtool` Vite plugin in this process, the keyed GET
    // redirect on the studio route stays closed
    expect(nitro.options.replace[DEVTOOLS_KEY_MARKER]).toBeUndefined()
    await nitro.close()
  })
})

describe('dev-database lifecycle hooks', () => {
  it('keeps the plugin hook calls and the generated declaration in agreement', async () => {
    // Given — the hook names reach consumers through the generated
    // .nitro/drizzle/hooks.d.ts and reach the runtime through literal
    // callHook sites in the plugin; the NitroRuntimeHooks augmentation
    // typechecks both sides against each other, and this pins drift
    // immediately instead of after the declarations regenerate.
    const generated = createRuntimeHooksDeclaration('postgres-js')
    const plugin = await readFile('src/runtime/plugin.ts', 'utf8')

    // Then — every hook the plugin fires is declared for consumers
    expect(generated).toContain(
      `'${CONFIG_HOOK}': (config: NitroDrizzleConfig) => void | Promise<void>`,
    )
    expect(generated).toContain(
      `'${SETUP_HOOK}': (client: NitroDrizzleMockClient) => void | Promise<void>`,
    )
    expect(generated).toContain(`'${SEED_HOOK}': () => void | Promise<void>`)
    expect(plugin).toContain(`callHook('${CONFIG_HOOK}',`)
    expect(plugin).toContain(`callHook('${SETUP_HOOK}',`)

    // And — the plugin fires config before construction, setup after it but
    // before the schema push, and seed after the push
    const configCall = plugin.indexOf(`callHook('${CONFIG_HOOK}',`)
    const constructCall = plugin.indexOf('const { mockDb, schema } = useDrizzle()')
    const setupCall = plugin.indexOf(`callHook('${SETUP_HOOK}',`)
    const pushCall = plugin.indexOf('pushDevSchema({')
    const seedCall = plugin.indexOf(`callHook('${SEED_HOOK}')`)
    for (const call of [configCall, constructCall, setupCall, pushCall, seedCall]) {
      expect(call).toBeGreaterThan(-1)
    }
    expect(configCall).toBeLessThan(constructCall)
    expect(constructCall).toBeLessThan(setupCall)
    expect(setupCall).toBeLessThan(pushCall)
    expect(pushCall).toBeLessThan(seedCall)

    // And — the declaration must be a module: without the leading `export {}`
    // the file is a global script and `declare module 'nitro/types'` turns
    // from an augmentation into an ambient declaration that shadows the real
    // package, typing every `definePlugin` callback parameter as implicit any
    expect(generated.startsWith('export {}')).toBe(true)
  })

  it('types the setup payload only with a dev engine, the connection from the driver', () => {
    const runtime = createRuntimeHooksDeclaration('postgres-js')
    expect(runtime).toContain(
      `connection?: string | { url?: string } & Partial<import('postgres').Options>`,
    )
    expect(runtime).toContain(`casing?: 'snake_case' | 'camelCase'`)
    expect(runtime).toContain(`logger?: boolean | import('drizzle-orm').Logger`)
    expect(runtime).toContain('type NitroDrizzleMockClient = unknown')

    const mocked = createRuntimeHooksDeclaration('postgres-js', 'pglite')
    expect(mocked).toContain(
      `connection?: string | Partial<import('@electric-sql/pglite').PGliteOptions> & { dataDir?: string }`,
    )
    expect(mocked).toContain(
      `type NitroDrizzleMockClient = ReturnType<typeof import("drizzle-orm/pglite").drizzle>['$client']`,
    )
  })

  it('omits the config hook for client-constructed drivers', () => {
    const d1 = createRuntimeHooksDeclaration('d1')
    expect(d1).not.toContain(`'${CONFIG_HOOK}'`)
    expect(d1).toContain(`'${SEED_HOOK}': () => void | Promise<void>`)
  })

  it('keeps libsql\'s required url when typing the connection', () => {
    // A replaced connection object wholly replaces the baked `{ url }`, so
    // the payload type must demand the url `@libsql/client` itself demands
    // instead of loosening the whole config to Partial.
    const libsql = createRuntimeHooksDeclaration('libsql')
    expect(libsql).toContain(`connection?: string | import('@libsql/client').Config`)
  })

  it('types the bun-sqlite connection through bun:sqlite', () => {
    // The adapter's own declaration imports bun:sqlite, so a bun-sqlite
    // consumer already resolves bun types — no degraded record needed.
    const bun = createRuntimeHooksDeclaration('bun-sqlite')
    expect(bun).toContain(
      `connection?: string | { source?: string } & Partial<import('bun:sqlite').DatabaseOptions>`,
    )
  })
})
