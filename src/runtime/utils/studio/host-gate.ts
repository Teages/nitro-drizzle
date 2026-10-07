/** Request surface the gate touches; keeps the gate unit-testable without an H3 event. */
export interface StudioGateRequest {
  readonly headers: Headers
  readonly host: string | null
}

export interface StudioHostGateOptions {
  /** Full `Bearer <key>` value the gate injects on a passing request. */
  readonly authorization: string
  /** Per-session `<uuid>.localhost` domain; the hostname is the capability. */
  readonly localhostDomain: string
  /** Base URL of the Studio web app; only its origin may talk to the studio. */
  readonly studioUrl: string
}

/**
 * Extracts the hostname from a raw Host value, ignoring any port suffix.
 * Returns `undefined` for missing or unparseable input — callers treat that
 * as "not the session domain" and fall through.
 */
export function studioRequestHost(host: string | null): string | undefined {
  if (host === null || host === '') {
    return undefined
  }
  try {
    return new URL(`http://${host}`).hostname
  }
  catch {
    return undefined
  }
}

/**
 * The in-process successor of the loopback proxy. Requests presenting the
 * per-session domain — port-agnostic, since fronting proxies may rewrite or
 * drop the port and the hostname itself is the unguessable capability —
 * with the Studio origin get the compile-time bearer injected, so the
 * route's bearer gate opens only for capability holders. Everything else,
 * the keyed devtools GET included, falls through to the bearer gate and
 * its 401.
 */
export function createStudioHostGate(
  options: StudioHostGateOptions,
): (request: StudioGateRequest) => Response | undefined {
  const studioOrigin = new URL(options.studioUrl).origin
  return (request) => {
    if (studioRequestHost(request.host) !== options.localhostDomain) {
      return undefined
    }
    if (request.headers.get('origin') !== studioOrigin) {
      return new Response('Forbidden', { status: 403 })
    }
    request.headers.set('authorization', options.authorization)
    return undefined
  }
}
