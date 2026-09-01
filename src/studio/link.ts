/**
 * Startup link printed for the user: the Studio web app plus the proxy port
 * and, when the security domain is on, the per-session `*.localhost` host the
 * web app connects to.
 */
export function studioLink(studioUrl: string, port: number, localhostDomain?: string): string {
  const url = new URL(studioUrl)
  url.searchParams.set('port', String(port))
  if (localhostDomain !== undefined) {
    url.searchParams.set('host', localhostDomain)
  }
  return url.toString()
}
