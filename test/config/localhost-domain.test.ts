import { describe, expect, it } from 'vitest'
import { createStudioLocalhostDomain, isMacosWithoutLocalhostDomainSupport } from '../../src/studio/localhost-domain'

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

describe('isMacosWithoutLocalhostDomainSupport', () => {
  it('flags darwin releases from before the system resolver learned *.localhost', () => {
    // macOS 15 Sequoia (Darwin 24) still fails to resolve the suffix;
    // macOS 26 Tahoe (Darwin 25) is the first release that does
    expect(isMacosWithoutLocalhostDomainSupport('darwin', '15.0.0')).toBe(true)
    expect(isMacosWithoutLocalhostDomainSupport('darwin', '24.5.0')).toBe(true)
    expect(isMacosWithoutLocalhostDomainSupport('darwin', '25.0.0')).toBe(false)
    expect(isMacosWithoutLocalhostDomainSupport('darwin', '27.0.0')).toBe(false)
  })

  it('leaves non-darwin platforms alone — their browsers resolve the suffix internally', () => {
    expect(isMacosWithoutLocalhostDomainSupport('linux', '6.14.0')).toBe(false)
    expect(isMacosWithoutLocalhostDomainSupport('win32', '10.0.26100')).toBe(false)
  })
})
