import { defineHandler } from 'nitro/h3'
import { drizzleConfig } from '#drizzle/config'
import studioRoute from './handler'
import { createStudioHostGate } from './host-gate'

export default defineHandler((event) => {
  const studio = drizzleConfig.devStudio
  const authKey = import.meta.DRIZZLE_STUDIO_KEY
  if (studio === undefined || authKey === undefined || authKey === '') {
    return
  }
  // x-forwarded-host first: dev frontends (the nuxt/vite proxy) rewrite
  // Host to their internal address and preserve the browser-facing one
  // here. The matched value is the unguessable domain either way, so
  // honoring the forwarded spelling costs no security.
  const host = event.req.headers.get('x-forwarded-host') ?? event.req.headers.get('host')
  const authorization = `Bearer ${authKey}`
  const rejection = createStudioHostGate({ authorization, ...studio })({ headers: event.req.headers, host })
  if (rejection !== undefined) {
    return rejection
  }
  // The gate injects the bearer only for the session domain, so reading it
  // back tells the vhost from ordinary app traffic. The Studio web app's
  // HTTP client posts to the bare scheme://host:port root, so the session
  // domain serves the studio route at every path — the domain, not the
  // path, is the mount point. Everything else (the keyed devtools GET
  // included) keeps flowing through the app's own routing, where the route
  // still enforces the bearer gate.
  if (event.req.headers.get('authorization') !== authorization) {
    return
  }
  return studioRoute(event)
})
