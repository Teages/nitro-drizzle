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

// Mints once per process: Nuxt instantiates several vite configs, and a
// remint would invalidate the URL an already-registered dock embeds.
export function provideDevtoolsKey(key?: string): string {
  const devtoolsGlobal = globalThis as DevtoolsKeyGlobal
  if (key !== undefined) {
    devtoolsGlobal[DEVTOOLS_KEY_GLOBAL] = key
    return key
  }
  devtoolsGlobal[DEVTOOLS_KEY_GLOBAL] ??= randomUUID()
  return devtoolsGlobal[DEVTOOLS_KEY_GLOBAL]
}

export function readDevtoolsKey(): string | undefined {
  return (globalThis as DevtoolsKeyGlobal)[DEVTOOLS_KEY_GLOBAL]
}
