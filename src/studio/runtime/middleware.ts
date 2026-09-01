import { defineHandler } from 'nitro/h3'
import { drizzleConfig } from '#drizzle/config'
import { STUDIO_ROUTE } from '../contracts'
import { createStudioHostGate } from './host-gate'

export default defineHandler((event) => {
  // Global middleware, self-filtered to the studio route: any other path —
  // the app's own traffic included — must not pay for the gate. A trailing
  // slash skips the gate and then misses nothing: the route keeps answering
  // with its bearer 401, so the skip fails closed.
  if (event.url.pathname !== STUDIO_ROUTE) {
    return
  }
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
  return createStudioHostGate({
    authorization: `Bearer ${authKey}`,
    ...studio,
  })({ headers: event.req.headers, host })
})
