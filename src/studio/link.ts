/** Startup link printed for the user: the Studio web app plus the proxy port. */
export function studioLink(studioUrl: string, port: number): string {
  const url = new URL(studioUrl)
  url.searchParams.set('port', String(port))
  return url.toString()
}
