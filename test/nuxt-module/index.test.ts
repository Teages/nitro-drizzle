import type { Nuxt } from '@nuxt/schema'
import { runWithNuxtContext } from '@nuxt/kit'
import { afterEach, describe, expect, it } from 'vitest'
import NuxtDrizzle from '../../src/nuxt'

interface RegisteredHook {
  event: string
  handler: (...args: never[]) => unknown
}

/** Minimal nuxt stand-in: records the hooks the module registers. */
function createStubNuxt(dev: boolean): { nuxt: Nuxt, hooks: RegisteredHook[] } {
  const hooks: RegisteredHook[] = []
  const nuxt = {
    options: { dev, buildDir: '/tmp/nuxt-drizzle-build' },
    hook: (event: string, handler: RegisteredHook['handler']) => {
      hooks.push({ event, handler })
    },
  }
  return { nuxt: nuxt as unknown as Nuxt, hooks }
}

async function setupModule(options: Record<string, unknown>, dev: boolean) {
  const { nuxt, hooks } = createStubNuxt(dev)
  await runWithNuxtContext(nuxt, () =>
    (NuxtDrizzle as unknown as (options: Record<string, unknown>, nuxt: Nuxt) => Promise<unknown>)(options, nuxt))
  return hooks
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
    const hooks = await setupModule({ devMock: true }, true)

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
    for (const hooks of sessions) {
      expect(hooks.map(({ event }) => event)).not.toContain('vite:extend')
      expect(hooks.map(({ event }) => event)).not.toContain('vite:extendConfig')
    }
  })
})
