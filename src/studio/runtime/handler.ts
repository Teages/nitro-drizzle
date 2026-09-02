import { defineHandler, getQuery, getRequestURL, HTTPError, redirect } from 'nitro/h3'
import { useDrizzle } from '#drizzle'
import { drizzleConfig } from '#drizzle/config'
import { createStudioExecutor } from './adapters'
import { handleStudioProtocol, studioCorsHeaders, studioDevtoolsRedirect, validateStudioAuthorization } from './protocol'

export default defineHandler(async (event) => {
  // The redirect must point the iframe's browser at a port it can reach: the
  // request's own (forwarded) host carries the public dev server port even
  // behind the nuxt/vite dev proxy. The default ports cover fronting setups
  // that strip the explicit port from the host.
  const requestUrl = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true })
  const requestPort = requestUrl.port || (requestUrl.protocol === 'https:' ? '443' : '80')

  // The devtools iframe navigates here without credentials, so its keyed GET
  // is settled before the bearer gate that governs the Studio traffic.
  const redirectUrl = studioDevtoolsRedirect({
    key: import.meta.DRIZZLE_DEVTOOLS_KEY,
    method: event.req.method,
    open: getQuery(event).open,
    requestPort,
    studio: drizzleConfig.devStudio,
  })
  if (redirectUrl !== undefined) {
    return redirect(redirectUrl)
  }

  const authError = validateStudioAuthorization(
    import.meta.DRIZZLE_STUDIO_KEY,
    event.req.headers.get('authorization'),
  )
  if (authError === 'not-configured') {
    throw HTTPError.status(404, 'Not Found')
  }
  if (authError === 'unauthorized') {
    throw HTTPError.status(401, 'Unauthorized')
  }

  if (event.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: studioCorsHeaders,
    })
  }
  if (event.req.method !== 'POST') {
    return new Response('Not Found', { status: 404, headers: studioCorsHeaders })
  }

  const engine = drizzleConfig.devEngine
  if (engine === undefined) {
    // No dev database: the studio route is not wired for real connections.
    throw HTTPError.status(404, 'Not Found')
  }
  const body = await event.req.json()
  const executor = createStudioExecutor(engine, useDrizzle().db)
  return await handleStudioProtocol(executor, {
    dialect: drizzleConfig.dialect,
    engine,
    connection: drizzleConfig.devConnection,
  }, body)
})
