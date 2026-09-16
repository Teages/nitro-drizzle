import type { Nitro } from 'nitro/types'
import { randomUUID } from 'node:crypto'
import { DEVTOOLS_KEY_MARKER, STUDIO_AUTH_KEY_MARKER, STUDIO_ROUTE } from '../studio/contracts'
import { readDevtoolsKey } from '../studio/devtools-key'

export function configureRuntime(nitro: Nitro): void {
  const runtimeDir = '@teages/nitro-drizzle/runtime'

  // Nitro externalizes dependencies during `nitro dev`. These runtime entries
  // import app-scoped virtual modules and Nitro context APIs, so they must be
  // compiled inside the consumer's server graph instead of loaded directly
  // from this package's node_modules scope.
  if (nitro.options.noExternals !== true) {
    const noExternals = Array.isArray(nitro.options.noExternals)
      ? nitro.options.noExternals
      : []
    if (!noExternals.includes(runtimeDir)) {
      noExternals.push(runtimeDir)
    }
    nitro.options.noExternals = noExternals
  }
  nitro.options.traceDeps ??= []
  if (!nitro.options.traceDeps.includes('drizzle-orm*')) {
    nitro.options.traceDeps.push('drizzle-orm*')
  }
  nitro.options.plugins.push('@teages/nitro-drizzle/runtime/plugins/drizzle')
  // Nitro swallows request-hook rejections: this middleware is what turns a
  // failed drizzle initialization into failed requests instead of routing
  // into handlers with an uninitialized client.
  nitro.options.handlers.push({
    route: '/**',
    middleware: true,
    handler: '@teages/nitro-drizzle/runtime/middleware/drizzle-gate',
  })
}

/** The auth key is baked in via `replace` — non-dev builds never get the route. */
export function configureStudioRuntime(nitro: Nitro): void {
  if (!nitro.options.dev) {
    return
  }
  nitro.options.replace[STUDIO_AUTH_KEY_MARKER] = JSON.stringify(randomUUID())
  const devtoolsKey = readDevtoolsKey()
  if (devtoolsKey !== undefined) {
    nitro.options.replace[DEVTOOLS_KEY_MARKER] = JSON.stringify(devtoolsKey)
  }
  // The middleware is the in-process successor of the loopback proxy,
  // injecting the bearer only for requests that present the per-session
  // domain and the Studio origin. It rides the global middleware chain
  // (nitro's routed-middleware path is broken in current betas) and
  // self-filters to the studio route; everything else keeps meeting the
  // route's bearer gate.
  nitro.options.handlers.push({
    route: '/**',
    middleware: true,
    handler: '@teages/nitro-drizzle/runtime/middleware/studio-gate',
  })
  nitro.options.routes[STUDIO_ROUTE] = {
    handler: '@teages/nitro-drizzle/runtime/routes/_drizzle/studio',
  }
}
