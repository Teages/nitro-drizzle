import type { Nitro } from 'nitro/types'
import type { ResolvedDevDatabase } from '../config/dev-database'
import { randomUUID } from 'node:crypto'
import { basename, resolve } from 'node:path'
import { STUDIO_AUTH_KEY_MARKER, STUDIO_ROUTE } from '../runtime/studio/constants'

const PACKAGE_NAME = '@teages/nitro-drizzle'

function runtimeEntry(path: string): string {
  // In source builds this file lives under `src/module`; in the published
  // bundle its code is folded into `dist/index.mjs`. Normalize both layouts
  // before resolving the separately built runtime entries.
  const packageRoot = basename(import.meta.dirname) === 'module'
    ? resolve(import.meta.dirname, '..')
    : import.meta.dirname
  return resolve(packageRoot, 'runtime', path)
}

export function configureRuntime(
  nitro: Nitro,
  devDb: ResolvedDevDatabase | undefined,
): void {
  // Nitro externalizes dependencies during `nitro dev`. These runtime entries
  // import app-scoped virtual modules and Nitro context APIs, so they must be
  // compiled inside the consumer's server graph instead of loaded directly
  // from this package's node_modules scope.
  if (nitro.options.noExternals !== true) {
    const noExternals = Array.isArray(nitro.options.noExternals)
      ? nitro.options.noExternals
      : []
    if (!noExternals.includes(PACKAGE_NAME)) {
      noExternals.push(PACKAGE_NAME)
    }
    nitro.options.noExternals = noExternals
  }
  nitro.options.traceDeps ??= []
  if (!nitro.options.traceDeps.includes('drizzle-orm*')) {
    nitro.options.traceDeps.push('drizzle-orm*')
  }
  nitro.options.experimental.tasks = true
  nitro.options.tasks['db:migrate'] = {
    handler: runtimeEntry('tasks/migrate'),
    description: 'Apply Drizzle database migrations',
  }
  if (devDb !== undefined) {
    nitro.options.plugins.push(
      runtimeEntry('plugins/dev-db'),
    )
    nitro.options.tasks['db:reset'] = {
      handler: runtimeEntry('tasks/reset'),
      description: 'Reset the dev database: drop schema, re-push, re-seed',
    }
  }
  if (nitro.options.dev) {
    // Resolve the runtime subpath straight to the virtual module: the
    // package's dist re-export never invalidates in Vite's dev graph, so
    // schema edits would leave `useDrizzle()` importers stale without it.
    nitro.options.alias['@teages/nitro-drizzle/runtime'] = '#drizzle'
    // The connection helper has no virtual dependencies, so dev resolves it
    // straight to the shipped entry — without this, the noExternals alias
    // rewrite cannot map the subpath and the dev build fails to resolve it.
    nitro.options.alias['@teages/nitro-drizzle/runtime/connection'] = runtimeEntry('connection')
  }
}

/**
 * Wires the built-in Drizzle Studio for dev-database sessions: an internal
 * route executing the Studio protocol plus a runtime plugin that serves the
 * loopback proxy the web app connects to. The per-session auth key is baked
 * into the build via `replace`, so non-dev builds never enable the route.
 */
export function configureStudioRuntime(nitro: Nitro): void {
  if (!nitro.options.dev) {
    return
  }
  nitro.options.replace[STUDIO_AUTH_KEY_MARKER] = JSON.stringify(randomUUID())
  nitro.options.routes[STUDIO_ROUTE] = {
    handler: runtimeEntry('studio/handler'),
  }
  nitro.options.plugins.push(
    runtimeEntry('plugins/studio'),
  )
}
