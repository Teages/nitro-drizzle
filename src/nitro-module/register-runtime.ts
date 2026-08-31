import type { Nitro } from 'nitro/types'
import type { ResolvedDevDatabase } from '../dev-database/contracts'
import { randomUUID } from 'node:crypto'
import { basename, resolve } from 'node:path'
import { DEVTOOLS_KEY_MARKER, STUDIO_AUTH_KEY_MARKER, STUDIO_ROUTE } from '../studio/contracts'
import { readDevtoolsKey } from '../studio/devtools-key'

const PACKAGE_NAME = '@teages/nitro-drizzle'

function runtimeEntry(path: string): string {
  // In source builds this file lives under `src/nitro-module`; in the
  // published bundle its code is folded into `dist/index.mjs`. Normalize both
  // layouts before resolving the separately built runtime entries.
  const packageRoot = basename(import.meta.dirname) === 'nitro-module'
    ? resolve(import.meta.dirname, '..')
    : import.meta.dirname
  return resolve(packageRoot, path)
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
  if (devDb !== undefined) {
    nitro.options.plugins.push(
      runtimeEntry('dev-database/runtime/plugin'),
    )
  }
  // The generated `#drizzle/config` imports this path bare. Alias it to
  // the real entry in every build: bundlers otherwise resolve it from
  // node_modules, which works for installed consumers but externalizes the
  // import (and breaks the server at runtime) wherever that link is absent.
  nitro.options.alias['@teages/nitro-drizzle/runtime/connection'] = runtimeEntry('configuration/runtime/connection')
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
  nitro.options.routes[STUDIO_ROUTE] = {
    handler: runtimeEntry('studio/runtime/handler'),
  }
  nitro.options.plugins.push(
    runtimeEntry('studio/runtime/plugin'),
  )
}
