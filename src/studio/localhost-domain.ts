import { randomUUID } from 'node:crypto'

/**
 * Per-session unguessable `*.localhost` hostname. The Studio web app passes
 * it as its `host` query parameter and connects to `http://<domain>:<port>`;
 * spec-following browsers resolve the `.localhost` suffix to loopback
 * without touching DNS (RFC 6761), so no hosts-file entry is involved.
 */
export function createStudioLocalhostDomain(): string {
  return `${randomUUID()}.localhost`
}
