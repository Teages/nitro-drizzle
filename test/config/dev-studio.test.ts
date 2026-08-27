import type { Nitro } from 'nitro/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_STUDIO_URL, DrizzleDevStudioError, resolveDevStudio } from '../../src/config/dev-studio'
import { DEV_ENV_FLAG } from '../../src/dev-database/resolve'
import { resolveDrizzleModuleContext } from '../../src/module/context'

describe('resolveDevStudio', () => {
  it('applies defaults for undefined and true', () => {
    expect(resolveDevStudio(undefined)).toEqual({
      port: undefined,
      silent: false,
      studioUrl: DEFAULT_STUDIO_URL,
    })
    expect(resolveDevStudio(true)).toEqual(resolveDevStudio(undefined))
  })

  it('disables the studio for false', () => {
    expect(resolveDevStudio(false)).toBeUndefined()
  })

  it('normalizes a partial options object', () => {
    expect(resolveDevStudio({ port: 4983 })).toEqual({
      port: 4983,
      silent: false,
      studioUrl: DEFAULT_STUDIO_URL,
    })
    expect(resolveDevStudio({ silent: true, studioUrl: 'http://localhost:5173/' })).toEqual({
      port: undefined,
      silent: true,
      studioUrl: 'http://localhost:5173/',
    })
  })

  it('rejects ports outside the valid range', () => {
    for (const port of [0, -1, 65536, 4983.5, Number.NaN]) {
      expect(() => resolveDevStudio({ port }))
        .toThrow(DrizzleDevStudioError)
      expect(() => resolveDevStudio({ port })).toThrow('devMock.studio.port')
    }
  })

  it('rejects studio URLs that are not absolute http(s) URLs', () => {
    for (const studioUrl of ['local.drizzle.studio', 'ftp://example.com', '']) {
      expect(() => resolveDevStudio({ studioUrl })).toThrow(DrizzleDevStudioError)
      expect(() => resolveDevStudio({ studioUrl })).toThrow('devMock.studio.studioUrl')
    }
  })
})

/** Minimal Nitro options shape `resolveDrizzleModuleContext` reads. */
function fakeNitro(dev: boolean): Nitro {
  return {
    options: {
      dev,
      rootDir: '/tmp/nitro-drizzle-studio-test',
      serverDir: '/tmp/nitro-drizzle-studio-test/.nitro',
      drizzle: {
        dialect: 'sqlite',
        driver: 'libsql',
        schemaPath: './server/db/schema.ts',
        devMock: { driver: 'node-sqlite', studio: { port: 99999 } },
      },
    },
  } as unknown as Nitro
}

describe('studio resolution in module context', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('resolves and validates the studio only alongside the dev database', () => {
    // Given — a dev session with an invalid studio port
    vi.stubEnv(DEV_ENV_FLAG, 'true')

    // When / Then — the build fails on the invalid dev-only option
    expect(() => resolveDrizzleModuleContext(fakeNitro(true)))
      .toThrow('devMock.studio.port')
  })

  it('ignores an invalid studio config in production builds', () => {
    // When — a production build carries a broken dev-only studio option
    const context = resolveDrizzleModuleContext(fakeNitro(false))

    // Then — dev options are ignored entirely, exactly like `drizzle.devMock`
    expect(context?.devDb).toBeUndefined()
    expect(context?.devStudio).toBeUndefined()
  })

  it('ignores an invalid studio config when dev is disabled by env', () => {
    // Given — a dev build whose dev database is switched off via env
    vi.stubEnv(DEV_ENV_FLAG, 'false')

    // When
    const context = resolveDrizzleModuleContext(fakeNitro(true))

    // Then — no dev database means no studio resolution or validation
    expect(context?.devDb).toBeUndefined()
    expect(context?.devStudio).toBeUndefined()
  })
})
