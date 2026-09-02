import { randomUUID } from 'node:crypto'
import { release } from 'node:os'
import process from 'node:process'

/**
 * Per-session unguessable `*.localhost` hostname. The Studio web app passes
 * it as its `host` query parameter and connects to `http://<domain>:<port>`;
 * spec-following browsers resolve the `.localhost` suffix to loopback
 * without touching DNS (RFC 6761), so no hosts-file entry is involved.
 */
export function createStudioLocalhostDomain(): string {
  return `${randomUUID()}.localhost`
}

/** Darwin major of macOS 26 (Tahoe), the first release whose system resolver resolves `*.localhost`. */
const DARWIN_MAJOR_RESOLVING_LOCALHOST_DOMAINS = 25

/**
 * Safari resolves `*.localhost` through the macOS system resolver, which
 * only learned the suffix in macOS 26 (Darwin 25). Chrome and Firefox
 * resolve the suffix inside the browser and work on every macOS release, so
 * this flags exactly the Safari-on-older-macOS combination.
 */
export function isMacosWithoutLocalhostDomainSupport(
  platform: string = process.platform,
  darwinRelease: string = release(),
): boolean {
  if (platform !== 'darwin') {
    return false
  }
  const major = Number(darwinRelease.split('.')[0])
  return Number.isInteger(major) && major < DARWIN_MAJOR_RESOLVING_LOCALHOST_DOMAINS
}
