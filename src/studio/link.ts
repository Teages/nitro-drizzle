/**
 * Startup link printed for the user: the Studio web app plus the dev server
 * port and the per-session `*.localhost` host the web app connects to.
 */
export function studioLink(studioUrl: string, localhostDomain: string, port: number | string): string {
  const url = new URL(studioUrl)
  url.searchParams.set('port', String(port))
  url.searchParams.set('host', localhostDomain)
  return url.toString()
}
