import type { Plugin } from 'vite'
import { STUDIO_ROUTE } from './studio/contracts'
import { provideDevtoolsKey } from './studio/devtools-key'

// Declared locally so the published entry carries no type dependency on
// @vitejs/devtools-kit (still an experimental 0.x API).
interface DevtoolsSetupContext {
  docks: {
    register: (entry: {
      id: string
      title: string
      icon: string
      type: 'iframe'
      url: string
    }) => unknown
  }
}

interface DevtoolsPlugin extends Plugin {
  devtools?: {
    setup: (context: DevtoolsSetupContext) => void | Promise<void>
  }
}

/**
 * Adds a Drizzle Studio tab to [Vite DevTools](https://devtools.vite.dev):
 * an iframe dock on the internal studio route.
 *
 * Serve-only on purpose: DevTools invokes `devtools.setup` in build mode too
 * (unless a plugin opts out via `capabilities`), but the studio route and its
 * key only exist in dev builds — a build-mode dock would point at a 404.
 */
export default function drizzleDevtool(): Plugin {
  const openKey = provideDevtoolsKey()
  const plugin: DevtoolsPlugin = {
    name: '@teages/nitro-drizzle/devtool',
    apply: 'serve',
    devtools: {
      setup(ctx) {
        ctx.docks.register({
          id: 'drizzle-studio',
          title: 'Drizzle Studio',
          icon: 'simple-icons:drizzle',
          type: 'iframe',
          url: `${STUDIO_ROUTE}?open=${openKey}`,
        })
      },
    },
  }
  return plugin
}
