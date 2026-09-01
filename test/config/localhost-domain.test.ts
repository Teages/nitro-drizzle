import { describe, expect, it } from 'vitest'
import { createStudioLocalhostDomain } from '../../src/studio/localhost-domain'

describe('createStudioLocalhostDomain', () => {
  it('builds an unguessable uuid.localhost hostname', () => {
    // Then — RFC 6761-style browsers resolve the suffix to loopback without
    // DNS, and the uuid turns the hostname into a per-session capability
    expect(createStudioLocalhostDomain()).toMatch(/^[0-9a-f-]{36}\.localhost$/)
  })

  it('mints a fresh domain per call', () => {
    expect(createStudioLocalhostDomain()).not.toBe(createStudioLocalhostDomain())
  })
})
