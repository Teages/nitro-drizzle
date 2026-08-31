import { randomUUID } from 'node:crypto'

// The `devtool` Vite plugin and the Nitro module ship in separate bundles
// (dist/devtool.mjs and dist/index.mjs), so the per-session key they must
// agree on travels through this global instead of module state. A global also
// survives nitro dev worker reloads: the minted key stays valid across the
// rebuilds that re-run the module setup.
const DEVTOOLS_KEY_GLOBAL = '__NITRO_DRIZZLE_DEVTOOLS_KEY__'

interface DevtoolsKeyGlobal {
  [DEVTOOLS_KEY_GLOBAL]?: string
}

/**
 * Publishes the devtools key the studio route's redirect gate compares
 * against. Called without arguments it mints a key once per process —
 * repeated factory calls (Nuxt instantiates several vite configs) must not
 * invalidate the URL an already-registered dock embeds. An explicit key
 * always overwrites, which lets tests pin a known value.
 */
export function provideDevtoolsKey(key?: string): string {
  const devtoolsGlobal = globalThis as DevtoolsKeyGlobal
  if (key !== undefined) {
    devtoolsGlobal[DEVTOOLS_KEY_GLOBAL] = key
    return key
  }
  devtoolsGlobal[DEVTOOLS_KEY_GLOBAL] ??= randomUUID()
  return devtoolsGlobal[DEVTOOLS_KEY_GLOBAL]
}

/**
 * Reads the published key from the Nitro module's build step. `undefined`
 * means the `devtool` plugin never ran in this process, and the studio
 * route keeps its redirect closed.
 */
export function readDevtoolsKey(): string | undefined {
  return (globalThis as DevtoolsKeyGlobal)[DEVTOOLS_KEY_GLOBAL]
}
