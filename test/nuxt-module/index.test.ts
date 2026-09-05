import type { Nuxt } from '@nuxt/schema'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runWithNuxtContext } from '@nuxt/kit'
import { afterEach, describe, expect, it } from 'vitest'
import NuxtDrizzle from '../../src/nuxt'

interface RegisteredHook {
  event: string
  handler: (...args: never[]) => unknown
}

const temporaryDirectories: string[] = []

/** Minimal nuxt stand-in: records the hooks the module registers. */
async function createStubNuxt(dev: boolean): Promise<{
  nuxt: Nuxt
  hooks: RegisteredHook[]
  alias: Record<string, string>
  templates: Nuxt['options']['build']['templates']
  buildDir: string
}> {
  const rootDir = await mkdtemp(join(process.cwd(), '.test-nuxt-drizzle-'))
  temporaryDirectories.push(rootDir)
  await mkdir(join(rootDir, 'server/db'), { recursive: true })
  await writeFile(
    join(rootDir, 'server/db/schema.ts'),
    `import { sqliteTable } from 'drizzle-orm/sqlite-core'

export const notes = sqliteTable('notes', {})
`,
  )
  const buildDir = join(rootDir, '.nuxt')
  const hooks: RegisteredHook[] = []
  const alias: Record<string, string> = {}
  const templates: Nuxt['options']['build']['templates'] = []
  const nuxt = {
    options: {
      dev,
      rootDir,
      serverDir: join(rootDir, 'server'),
      buildDir,
      alias,
      build: { templates },
    },
    hook: (event: string, handler: RegisteredHook['handler']) => {
      hooks.push({ event, handler })
    },
  }
  return { nuxt: nuxt as unknown as Nuxt, hooks, alias, templates, buildDir }
}

async function setupModule(options: Record<string, unknown>, dev: boolean) {
  const { nuxt, hooks, alias, templates, buildDir } = await createStubNuxt(dev)
  await runWithNuxtContext(nuxt, () =>
    (NuxtDrizzle as unknown as (options: Record<string, unknown>, nuxt: Nuxt) => Promise<unknown>)(options, nuxt))
  return { hooks, alias, templates, buildDir }
}

/** Runs every vite hook `addVitePlugin` registered against a fresh config. */
async function extendViteConfig(hooks: RegisteredHook[]): Promise<{ name?: string, apply?: string }[]> {
  const config: { plugins?: { name?: string, apply?: string }[] } = {}
  for (const { event, handler } of hooks) {
    if (event === 'vite:extend') {
      await handler({ config } as never)
    }
    else if (event === 'vite:extendConfig') {
      await handler(config as never)
    }
  }
  return config.plugins ?? []
}

const VALID_DRIZZLE = {
  dialect: 'sqlite',
  driver: 'libsql',
  schemaPath: './server/db/schema.ts',
}

describe('@teages/nitro-drizzle/nuxt', () => {
  const previousEnvFlag = process.env.NITRO_DRIZZLE_DEV_MOCK

  afterEach(async () => {
    if (previousEnvFlag === undefined) {
      delete process.env.NITRO_DRIZZLE_DEV_MOCK
    }
    else {
      process.env.NITRO_DRIZZLE_DEV_MOCK = previousEnvFlag
    }
    await Promise.all(
      temporaryDirectories.splice(0).map(path =>
        rm(path, { recursive: true, force: true }),
      ),
    )
  })

  it('adds the devtool vite plugin to dev sessions with a studio', async () => {
    // Given — dev mode with the dev database requested
    const { hooks } = await setupModule({ devMock: true }, true)

    // Then — every vite config receives the serve-only devtool plugin
    expect(await extendViteConfig(hooks)).toMatchObject([
      { name: '@teages/nitro-drizzle/devtool', apply: 'serve' },
    ])
  })

  it('keeps the dock out of sessions where the studio route cannot exist', async () => {
    // Given — a production build, no dev database, the studio turned off,
    // and the env override disabling the dev session
    process.env.NITRO_DRIZZLE_DEV_MOCK = 'false'
    const sessions = [
      await setupModule({ devMock: true }, false),
      await setupModule({}, true),
      await setupModule({ devMock: { studio: false } }, true),
      await setupModule({ devMock: true }, true),
    ]

    // Then — none of them touch the vite pipeline
    for (const { hooks } of sessions) {
      expect(hooks.map(({ event }) => event)).not.toContain('vite:extend')
      expect(hooks.map(({ event }) => event)).not.toContain('vite:extendConfig')
    }
  })

  it('gives the app environments the #drizzle surface', async () => {
    // Given — any session with a usable drizzle config
    const { hooks, alias, templates, buildDir } = await setupModule(VALID_DRIZZLE, false)
    const typesDir = join(buildDir, 'drizzle')

    // Then — the browser alias resolves to the gate template on disk, whose
    // only export is a useDrizzle that throws
    expect(alias['#drizzle']).toBe(`${buildDir}/app-drizzle-gate.mjs`)
    const gate = templates.find(template => template.filename === 'app-drizzle-gate.mjs')
    expect(gate?.getContents).toBeTypeOf('function')
    expect(await gate?.getContents?.({} as never)).toContain('throw new Error')

    // And — the type hooks generate the declarations and reference them, so
    // `#drizzle` types infer across environments
    const typesHook = hooks.find(({ event }) => event === 'prepare:types')
    expect(typesHook).toBeDefined()
    const payload = { references: [] }
    await typesHook?.handler(payload as never)
    expect(payload.references).toEqual([
      { path: join(typesDir, 'hooks.d.ts') },
      { path: join(typesDir, 'modules.d.ts') },
      { path: join(typesDir, 'schema.d.ts') },
    ])
    const modules = await readFile(join(typesDir, 'modules.d.ts'), 'utf8')
    expect(modules).toContain(`declare module '#drizzle'`)
  })

  it('owns the type lifecycle regardless of the typesDir option', async () => {
    // Given — a typesDir the user configured
    const { hooks } = await setupModule({ ...VALID_DRIZZLE, typesDir: 'types/drizzle' }, false)

    // Then — the nitro module receives the option overridden to false, so
    // it never writes declarations at its own setup
    const nitroConfig: { modules?: unknown[], drizzle?: Record<string, unknown> } = {}
    const configHook = hooks.find(({ event }) => event === 'nitro:config')
    await configHook?.handler(nitroConfig as never)
    expect(nitroConfig.drizzle).toEqual({ ...VALID_DRIZZLE, typesDir: false })

    // And — the type hooks still reference <buildDir>/drizzle, where the
    // module generates while Nuxt prepares types
    const typesHook = hooks.find(({ event }) => event === 'prepare:types')
    const payload = { references: [] as { path: string }[] }
    await typesHook?.handler(payload as never)
    expect(payload.references.length).toBe(3)
    expect(payload.references.every(ref => ref.path.includes('.nuxt/drizzle/'))).toBe(true)
  })

  it('registers no type references without a usable drizzle config', async () => {
    // Given — the module installed without dialect/driver, only typesDir
    const { hooks, buildDir } = await setupModule({ typesDir: 'types/drizzle' }, false)

    // Then — the type hooks neither generate nor reference declarations:
    // references to missing files break type preparation
    const payload = { references: [] }
    const typesHook = hooks.find(({ event }) => event === 'prepare:types')
    await typesHook?.handler(payload as never)
    const nitroTypesHook = hooks.find(({ event }) => event === 'nitro:prepare:types')
    await nitroTypesHook?.handler(payload as never)
    expect(payload.references).toEqual([])
    expect(existsSync(join(buildDir, 'drizzle'))).toBe(false)
  })
})
