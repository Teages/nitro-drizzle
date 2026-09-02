import type { Nuxt } from '@nuxt/schema'
import { runWithNuxtContext } from '@nuxt/kit'
import { afterEach, describe, expect, it } from 'vitest'
import NuxtDrizzle from '../../src/nuxt'

interface RegisteredHook {
  event: string
  handler: (...args: never[]) => unknown
}

/** Minimal nuxt stand-in: records the hooks the module registers. */
function createStubNuxt(dev: boolean): {
  nuxt: Nuxt
  hooks: RegisteredHook[]
  alias: Record<string, string>
  templates: Nuxt['options']['build']['templates']
} {
  const hooks: RegisteredHook[] = []
  const alias: Record<string, string> = {}
  const templates: Nuxt['options']['build']['templates'] = []
  const nuxt = {
    options: { dev, buildDir: '/tmp/nuxt-drizzle-build', alias, build: { templates } },
    hook: (event: string, handler: RegisteredHook['handler']) => {
      hooks.push({ event, handler })
    },
  }
  return { nuxt: nuxt as unknown as Nuxt, hooks, alias, templates }
}

async function setupModule(options: Record<string, unknown>, dev: boolean) {
  const { nuxt, hooks, alias, templates } = createStubNuxt(dev)
  await runWithNuxtContext(nuxt, () =>
    (NuxtDrizzle as unknown as (options: Record<string, unknown>, nuxt: Nuxt) => Promise<unknown>)(options, nuxt))
  return { hooks, alias, templates }
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

describe('@teages/nitro-drizzle/nuxt', () => {
  const previousEnvFlag = process.env.NITRO_DRIZZLE_DEV_MOCK

  afterEach(() => {
    if (previousEnvFlag === undefined) {
      delete process.env.NITRO_DRIZZLE_DEV_MOCK
    }
    else {
      process.env.NITRO_DRIZZLE_DEV_MOCK = previousEnvFlag
    }
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
    // Given — any session; the app wiring does not depend on the dev session
    const { hooks, alias, templates } = await setupModule({}, false)
    const buildDir = '/tmp/nuxt-drizzle-build'

    // Then — the browser alias resolves to the gate template on disk, whose
    // only export is a useDrizzle that throws
    expect(alias['#drizzle']).toBe(`${buildDir}/app-drizzle-gate.mjs`)
    const gate = templates.find(template => template.filename === 'app-drizzle-gate.mjs')
    expect(gate?.getContents).toBeTypeOf('function')
    expect(await gate?.getContents?.({} as never)).toContain('throw new Error')

    // And — the app tsconfig references the same generated declarations as
    // the nitro types, so `#drizzle` types infer across environments
    const typesHook = hooks.find(({ event }) => event === 'prepare:types')
    expect(typesHook).toBeDefined()
    const payload = { references: [] }
    await typesHook?.handler(payload as never)
    expect(payload.references).toEqual([
      { path: `${buildDir}/drizzle/hooks.d.ts` },
      { path: `${buildDir}/drizzle/modules.d.ts` },
      { path: `${buildDir}/drizzle/schema.d.ts` },
    ])
  })
})
