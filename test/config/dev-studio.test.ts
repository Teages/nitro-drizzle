import type { Nitro } from 'nitro/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEV_ENV_FLAG } from '../../src/dev-database/resolve'
import { resolveDrizzleModuleContext } from '../../src/nitro-module/context'
import { DEFAULT_STUDIO_URL, DrizzleDevStudioError, resolveDevStudio } from '../../src/studio/resolve'

describe('resolveDevStudio', () => {
  it('applies defaults for undefined and true', () => {
    expect(resolveDevStudio(undefined)).toEqual({
      localhostDomain: expect.any(String),
      silent: false,
      studioUrl: DEFAULT_STUDIO_URL,
    })
    expect(resolveDevStudio(true)?.silent).toBe(false)
  })

  it('disables the studio for false', () => {
    expect(resolveDevStudio(false)).toBeUndefined()
  })

  it('mints a fresh per-session localhost domain every call', () => {
    expect(resolveDevStudio({})?.localhostDomain).toMatch(/^[0-9a-f-]{36}\.localhost$/)
    expect(resolveDevStudio({})?.localhostDomain).not.toBe(resolveDevStudio({})?.localhostDomain)
  })

  it('normalizes a partial options object', () => {
    expect(resolveDevStudio({ silent: true, studioUrl: 'http://localhost:5173/' })).toEqual({
      localhostDomain: expect.any(String),
      silent: true,
      studioUrl: 'http://localhost:5173/',
    })
  })

  it('rejects studio URLs that are not absolute http(s) URLs', () => {
    for (const studioUrl of ['local.drizzle.studio', 'ftp://example.com', '']) {
      expect(() => resolveDevStudio({ studioUrl })).toThrow(DrizzleDevStudioError)
      expect(() => resolveDevStudio({ studioUrl })).toThrow('devMock.studio.studioUrl')
    }
  })

  it('rejects options removed by the shared-port studio with a migration hint', () => {
    const removed: ReadonlyArray<Record<string, unknown>> = [{ port: 4983 }, { securityLocalhostDomain: false }]
    for (const options of removed) {
      expect(() => resolveDevStudio(options)).toThrow(DrizzleDevStudioError)
      expect(() => resolveDevStudio(options)).toThrow('has been removed')
    }
  })
})

/** Minimal Nitro options shape `resolveDrizzleModuleContext` reads. */
function fakeNitro(dev: boolean, studio: unknown = { studioUrl: 'local.drizzle.studio' }): Nitro {
  return {
    options: {
      dev,
      rootDir: '/tmp/nitro-drizzle-studio-test',
      serverDir: '/tmp/nitro-drizzle-studio-test/.nitro',
      drizzle: {
        dialect: 'sqlite',
        driver: 'libsql',
        schemaPath: './server/db/schema.ts',
        devMock: { driver: 'node-sqlite', studio },
      },
    },
  } as unknown as Nitro
}

describe('studio resolution in module context', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('resolves and validates the studio only alongside the dev database', async () => {
    // Given — a dev session with an invalid studio URL
    vi.stubEnv(DEV_ENV_FLAG, 'true')

    // When / Then — the build fails on the invalid dev-only option
    await expect(resolveDrizzleModuleContext(fakeNitro(true)))
      .rejects
      .toThrow('devMock.studio.studioUrl')
  })

  it('mints the per-session localhost domain for the runtime', async () => {
    // Given — a dev session relying on the default studio options
    vi.stubEnv(DEV_ENV_FLAG, 'true')

    // When
    const context = await resolveDrizzleModuleContext(fakeNitro(true, {}))

    // Then — the session carries an unguessable *.localhost hostname
    expect(context?.devStudio?.localhostDomain).toMatch(/^[0-9a-f-]{36}\.localhost$/)
  })

  it('ignores an invalid studio config in production builds', async () => {
    // When — a production build carries a broken dev-only studio option
    const context = await resolveDrizzleModuleContext(fakeNitro(false))

    // Then — dev options are ignored entirely, exactly like `drizzle.devMock`
    expect(context?.devDb).toBeUndefined()
    expect(context?.devStudio).toBeUndefined()
  })

  it('ignores an invalid studio config when dev is disabled by env', async () => {
    // Given — a dev build whose dev database is switched off via env
    vi.stubEnv(DEV_ENV_FLAG, 'false')

    // When
    const context = await resolveDrizzleModuleContext(fakeNitro(true))

    // Then — no dev database means no studio resolution or validation
    expect(context?.devDb).toBeUndefined()
    expect(context?.devStudio).toBeUndefined()
  })
})
