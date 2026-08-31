import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createNitro } from 'nitro/builder'
import { afterEach, describe, expect, it } from 'vitest'
import buildConfig from '../build.config'
import NitroDrizzle from '../src'
import { DEV_DATABASE_SEED_HOOK } from '../src/dev-database/contracts'
import { createRuntimeHooksDeclaration } from '../src/schema-artifacts/runtime-hooks-declaration'
import { DEVTOOLS_KEY_MARKER, STUDIO_AUTH_KEY_MARKER, STUDIO_ROUTE } from '../src/studio/contracts'

const CONNECTION_ALIAS_KEY = '@teages/nitro-drizzle/runtime/connection'
const CONNECTION_IMPORT = `import { resolveDrizzleConnection } from '${CONNECTION_ALIAS_KEY}'`
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
      './src/dev-database/runtime/plugin.ts',
      './src/devtool.ts',
      './src/index.ts',
      './src/nuxt.ts',
      './src/studio/runtime/handler.ts',
      './src/studio/runtime/plugin.ts',
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
    expect(virtualSource(nitro, '#drizzle/schema'))
      .toContain('export const { ["relations"]: relations = {}, ...schema } = source')
    expect(virtualSource(nitro, '#drizzle/config')).toContain('export const drizzleConfig = {')
    expect(virtualSource(nitro, '#drizzle/config')).toContain('export function useDrizzleConnection()')

    // And — both runtime plugins are registered and every registered plugin
    // and route handler exists on disk
    for (const expected of ['dev-database/runtime/plugin', 'studio/runtime/plugin']) {
      const registered = nitro.options.plugins.find(plugin =>
        plugin.replaceAll('\\', '/').endsWith(expected))
      expect(registered, `${expected} must be registered`).toBeDefined()
    }
    for (const plugin of nitro.options.plugins) {
      expect(moduleFileExists(plugin), `${plugin} must resolve to a file`).toBe(true)
    }
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

describe('dev-database seed hook', () => {
  it('derives the generated declaration and the plugin call from one constant', async () => {
    // Given — the hook reaches consumers through exactly one declaration:
    // the generated .nitro/drizzle/hooks.d.ts. The runtime plugin never
    // names the hook literally; both sides derive from the constant.
    const generated = createRuntimeHooksDeclaration()
    const plugin = await readFile('src/dev-database/runtime/plugin.ts', 'utf8')

    // Then — constant, declaration, and call site agree on the name
    expect(DEV_DATABASE_SEED_HOOK).toBe(SEED_HOOK)
    expect(generated).toContain(`'${SEED_HOOK}': () => void | Promise<void>`)
    expect(plugin).toContain('callHook(DEV_DATABASE_SEED_HOOK)')

    // And — the declaration must be a module: without the leading `export {}`
    // the file is a global script and `declare module 'nitro/types'` turns
    // from an augmentation into an ambient declaration that shadows the real
    // package, typing every `definePlugin` callback parameter as implicit any
    expect(generated.startsWith('export {}')).toBe(true)
  })
})
