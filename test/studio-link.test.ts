import { describe, expect, it } from 'vitest'
import { studioLink } from '../src/studio/link'

const STUDIO_URL = 'https://local.drizzle.studio'
const STUDIO_DOMAIN = '6f9c9e22-c1dc-4c76-93e2-076b8f4c4a65.localhost'

describe('studioLink', () => {
  it('appends the dev port and session domain without clobbering existing params', () => {
    expect(studioLink(STUDIO_URL, STUDIO_DOMAIN, 3000))
      .toBe(`https://local.drizzle.studio/?port=3000&host=${STUDIO_DOMAIN}`)
    expect(studioLink('http://localhost:5173/studio?token=x', STUDIO_DOMAIN, '99'))
      .toBe(`http://localhost:5173/studio?token=x&port=99&host=${STUDIO_DOMAIN}`)
  })
})
