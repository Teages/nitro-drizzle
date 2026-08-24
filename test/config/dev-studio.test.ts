import { describe, expect, it } from 'vitest'
import { DEFAULT_STUDIO_URL, DrizzleDevStudioError, resolveDevStudio } from '../../src/config/dev-studio'

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
      expect(() => resolveDevStudio({ port })).toThrow('dev.studio.port')
    }
  })

  it('rejects studio URLs that are not absolute http(s) URLs', () => {
    for (const studioUrl of ['local.drizzle.studio', 'ftp://example.com', '']) {
      expect(() => resolveDevStudio({ studioUrl })).toThrow(DrizzleDevStudioError)
      expect(() => resolveDevStudio({ studioUrl })).toThrow('dev.studio.studioUrl')
    }
  })
})
