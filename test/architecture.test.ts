import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createNitro } from 'nitro/builder'
import { afterEach, describe, expect, it } from 'vitest'
import NitroDrizzle from '../src'
import { RUNTIME_NO_EXTERNAL } from '../src/nitro-module/register-runtime'
import { createRuntimeHooksDeclaration } from '../src/schema-artifacts/runtime-hooks-declaration'
import { DEVTOOLS_KEY_MARKER, STUDIO_AUTH_KEY_MARKER, STUDIO_ROUTE } from '../src/studio/contracts'
import buildConfig from '../tsdown.config'

const CONFIG_HOOK = 'drizzle:config'
const SETUP_HOOK = 'drizzle:dev-mock:setup'
const SEED_HOOK = 'drizzle:dev-mock:seed'

const temporaryDirectories: string[] = []

/**
 * Runtime entries register as absolute files. Source runs point at
 * `src/runtime`; the published bundle points at `dist/runtime`.
 */
function runtimeSpecifierShips(specifier: string): boolean {
  return existsSync(specifier)
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
  it('maps the five public entries to types and runtime files', async () => {
    // Given — tsdown writes both halves of the contract: `exports` serves this
    // repository and points at sources, while `publishConfig.exports` replaces
    // it with the built files when a publishConfig-aware pack runs
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      exports: Record<string, string | Record<string, string>>
      publishConfig: { exports: Record<string, string | Record<string, string>> }
      typesVersions: { '*': Record<string, string[]> }
    }

    // Then — every facade and the runtime wildcard exist in both worlds, and
    // the dev half never needs a build
    expect(Object.keys(packageJson.exports)).toEqual([
      '.',
      './config',
      './devtool',
      './nuxt',
      './types',
      './package.json',
      './runtime/*',
    ])
    expect(Object.keys(packageJson.publishConfig.exports)).toEqual([
      '.',
      './config',
      './devtool',
      './nuxt',
      './types',
      './package.json',
      './runtime/*',
    ])
    for (const [entry, file] of [
      ['.', 'index'],
      ['./nuxt', 'nuxt'],
      ['./config', 'config'],
      ['./types', 'types'],
      ['./devtool', 'devtool'],
    ] as const) {
      expect(packageJson.exports[entry]).toBe(`./src/${file}.ts`)
      expect(packageJson.publishConfig.exports[entry]).toBe(`./dist/${file}.mjs`)
      expect(packageJson.typesVersions['*'][entry]).toEqual([
        `./dist/${file}.d.mts`,
      ])
    }
    // And — Nitro resolves runtime entries one by one, from source here and
    // from the bundled tree once installed
    expect(packageJson.exports['./runtime/*']).toBe('./src/runtime/*.ts')
    expect(packageJson.publishConfig.exports['./runtime/*']).toBe('./dist/runtime/*.mjs')
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

  it('builds every tsdown entry from an existing source file', () => {
    // Given — tsdown mirrors entry names into dist/, so an entry pointing at
    // a moved file ships nothing and breaks the published package
    const configs = Array.isArray(buildConfig)
      ? buildConfig
      : [buildConfig]
    const entries: string[] = configs.flatMap((config) => {
      // tsdown accepts a pattern, a pattern list, or a name-to-pattern record
      const entry: unknown = config.entry
      if (typeof entry === 'string') {
        return [entry]
      }
      if (Array.isArray(entry)) {
        return entry.map(String)
      }
      if (entry && typeof entry === 'object') {
        return Object.values(entry).flat().map(String)
      }
      return []
    })

    // Then — the exact entry set: the five ABI facades at their
    // dist-determining locations plus the runtime tree the unbundled
    // pass ships file-for-file
    expect([...entries].sort()).toEqual([
      '!src/runtime/**/*.d.ts',
      'src/config.ts',
      'src/devtool.ts',
      'src/index.ts',
      'src/nuxt.ts',
      'src/runtime/**/*.ts',
      'src/types.ts',
    ])
    for (const input of entries) {
      if (input.startsWith('!') || input.includes('*')) {
        continue
      }
      expect(existsSync(input), `${input} must exist`).toBe(true)
    }
  })

  it('gates the packed package through publint and attw in CI', () => {
    // Given — the tarball is what npm serves, and only tsdown's post-build
    // check reads it: a resolver-matrix regression here fails the release
    // build instead of the consumer. Publint/attw are CI-only so a local
    // build stays fast, and the profile drops the node10 and CJS-require
    // rows `engines` (Node 26, ESM only) already rules out.
    const configs = Array.isArray(buildConfig)
      ? buildConfig
      : [buildConfig]
    const gated = configs.filter(config => config.publint || config.attw)

    // Then
    expect(gated).toHaveLength(1)
    expect(gated[0].publint).toBe('ci-only')
    expect(gated[0].attw).toMatchObject({
      enabled: 'ci-only',
      level: 'error',
      profile: 'esm-only',
    })
  })

  it('keeps the runtime tree self-contained for the unbundled pass', async () => {
    // Given — the unbundled pass ships src/runtime file-for-file and keeps
    // relative imports as-is: a specifier escaping the tree points into
    // module-side source that exists only inside the bundled facades, so
    // the published runtime would import a file the package never contains
    const files: string[] = []
    const collect = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          await collect(join(dir, entry.name))
        }
        else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
          files.push(join(dir, entry.name))
        }
      }
    }
    await collect('src/runtime')

    // Then — every import that survives the transform resolves inside the
    // tree; explicit `import type` lines are erased and may keep pointing
    // at the shared src/types ABI
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      for (const line of (await readFile(file, 'utf8')).split('\n')) {
        if (/^\s*import\s+type\b/.test(line)) {
          continue
        }
        for (const specifier of [
          ...line.matchAll(/['"](\.[^'"]+)['"]/g),
        ].map(match => match[1])) {
          const resolved = join(dirname(file), specifier)
          expect(
            resolved.startsWith('src/runtime/'),
            `${file} imports ${specifier}, which escapes src/runtime`,
          ).toBe(true)
          expect(existsSync(resolved) || existsSync(`${resolved}.ts`), `${resolved} must exist`).toBe(true)
        }
      }
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

    // Then — connection resolution is copied into the virtual module
    expect(virtualSource(nitro, '#drizzle/config')).toContain('function resolveDrizzleConnection(connection)')
    expect(virtualSource(nitro, '#drizzle/config')).not.toContain('@teages/nitro-drizzle/runtime')

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
      /runtime\/plugins\/drizzle(?:\.m?js|\.ts)?$/.test(plugin.replaceAll('\\', '/')))
    expect(registered, 'runtime/plugins/drizzle must be registered').toBeDefined()
    for (const plugin of nitro.options.plugins) {
      expect(runtimeSpecifierShips(plugin), `${plugin} must resolve to a shipped runtime file`).toBe(true)
    }
    const rootMiddlewares = nitro.options.handlers.filter(handler =>
      handler.route === '/**' && handler.middleware === true)
    const readyGate = rootMiddlewares.find(handler =>
      /runtime\/middleware\/drizzle-gate(?:\.m?js|\.ts)?$/.test(handler.handler.replaceAll('\\', '/')))
    expect(readyGate, 'runtime/middleware/drizzle-gate must be registered').toBeDefined()
    const studioGate = rootMiddlewares.find(handler =>
      /runtime\/middleware\/studio-gate(?:\.m?js|\.ts)?$/.test(handler.handler.replaceAll('\\', '/')))
    expect(studioGate?.handler.replaceAll('\\', '/')).toMatch(/runtime\/middleware\/studio-gate(?:\.m?js|\.ts)?$/)
    expect(runtimeSpecifierShips(studioGate?.handler ?? '')).toBe(true)
    const studioRoute = nitro.options.routes[STUDIO_ROUTE]
    if (typeof studioRoute === 'string' || studioRoute === undefined) {
      throw new Error(`Expected ${STUDIO_ROUTE} to be a handler object.`)
    }
    expect(studioRoute.handler.replaceAll('\\', '/')).toMatch(/runtime\/routes\/_drizzle\/studio(?:\.m?js|\.ts)?$/)
    expect(runtimeSpecifierShips(studioRoute.handler)).toBe(true)

    // And — the externalization escape covers the runtime directory only.
    // Vite skips absolute ids, and a nested dependency stays external.
    expect(nitro.options.noExternals).toContain(RUNTIME_NO_EXTERNAL)
    expect(registered && RUNTIME_NO_EXTERNAL.test(registered)).toBe(true)
    expect(RUNTIME_NO_EXTERNAL.test(`${registered}/node_modules/pkg/index.js`)).toBe(false)
    expect(RUNTIME_NO_EXTERNAL.test('@teages/nitro-drizzle')).toBe(false)
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
    const plugin = await readFile('src/runtime/plugins/drizzle.ts', 'utf8')

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
    for (const call of [
      configCall,
      constructCall,
      setupCall,
      pushCall,
      seedCall,
    ]) {
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
