import { describe, expect, it } from 'vitest'
import { createStudioHostGate, studioRequestHost } from '../../../src/studio/runtime/host-gate'

const STUDIO_URL = 'https://local.drizzle.studio'
const STUDIO_DOMAIN = '6f9c9e22-c1dc-4c76-93e2-076b8f4c4a65.localhost'

/** Request-shaped stub: the gate reads Host/Origin and injects Authorization. */
interface GateRequest {
  readonly headers: Headers
  readonly host: string | null
}

function gateRequest(init: { host?: string, origin?: string }): GateRequest {
  const headers = new Headers()
  if (init.origin !== undefined) {
    headers.set('origin', init.origin)
  }
  return { headers, host: init.host ?? null }
}

describe('studioRequestHost', () => {
  it('extracts the hostname, ignoring the port suffix', () => {
    expect(studioRequestHost(`${STUDIO_DOMAIN}:3000`)).toBe(STUDIO_DOMAIN)
    expect(studioRequestHost(STUDIO_DOMAIN)).toBe(STUDIO_DOMAIN)
    expect(studioRequestHost('LOCALHOST:3000')).toBe('localhost')
  })

  it('yields undefined for missing or unparseable hosts', () => {
    expect(studioRequestHost(null)).toBeUndefined()
    expect(studioRequestHost('')).toBeUndefined()
    expect(studioRequestHost('[::1')).toBeUndefined()
  })
})

describe('createStudioHostGate', () => {
  it('injects the bearer for the per-session host with the Studio origin', () => {
    // Given — the browser-shaped request the Studio web app sends
    const gate = createStudioHostGate({
      authorization: 'Bearer test',
      localhostDomain: STUDIO_DOMAIN,
      studioUrl: STUDIO_URL,
    })
    const request = gateRequest({ host: `${STUDIO_DOMAIN}:3000`, origin: STUDIO_URL })

    // When — the gate passes it through (undefined = continue)
    // Then — the downstream bearer gate sees the injected key
    expect(gate(request)).toBeUndefined()
    expect(request.headers.get('authorization')).toBe('Bearer test')
  })

  it('rejects the per-session host under a foreign origin before injecting', () => {
    const gate = createStudioHostGate({
      authorization: 'Bearer test',
      localhostDomain: STUDIO_DOMAIN,
      studioUrl: STUDIO_URL,
    })
    const request = gateRequest({ host: `${STUDIO_DOMAIN}:3000`, origin: 'https://evil.example' })

    // When / Then — 403 and no key leaked into the request
    expect(gate(request)?.status).toBe(403)
    expect(request.headers.get('authorization')).toBeNull()
  })

  it('falls through without injecting when the host is not the session domain', () => {
    // Given — every other host spelling: the keyed devtools GET and direct
    // probes must keep meeting the handler's bearer gate (401)
    const gate = createStudioHostGate({
      authorization: 'Bearer test',
      localhostDomain: STUDIO_DOMAIN,
      studioUrl: STUDIO_URL,
    })

    for (const host of ['127.0.0.1:3000', 'localhost:3000', 'evil.example:3000']) {
      const request = gateRequest({ host, origin: STUDIO_URL })
      expect(gate(request)).toBeUndefined()
      expect(request.headers.get('authorization')).toBeNull()
    }
  })

  it('matches the host case-insensitively regardless of the port suffix', () => {
    // Given — Host is case-insensitive per HTTP, and fronting proxies may
    // rewrite or drop the port; the hostname itself is the capability
    const gate = createStudioHostGate({
      authorization: 'Bearer test',
      localhostDomain: STUDIO_DOMAIN,
      studioUrl: STUDIO_URL,
    })
    const request = gateRequest({ host: `${STUDIO_DOMAIN.toUpperCase()}:4983`, origin: STUDIO_URL })

    // When / Then
    expect(gate(request)).toBeUndefined()
    expect(request.headers.get('authorization')).toBe('Bearer test')
  })
})
