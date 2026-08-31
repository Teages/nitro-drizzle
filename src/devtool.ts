import type { Plugin } from 'vite'
import { STUDIO_ROUTE } from './studio/contracts'
import { provideDevtoolsKey } from './studio/devtools-key'

// The `devtools` hook and its context come from @vitejs/devtools-kit's module
// augmentation, which is still an experimental 0.x API. Declaring the slice
// this plugin consumes keeps the published entry free of that type dependency
// (consumers without the kit installed still typecheck) and the runtime
// behaves the same either way: without DevTools the hook is simply never
// called.
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
 * an iframe dock fixed to the internal studio route, which redirects the
 * keyed GET from the iframe to the Studio web app. The key is minted here —
 * before any build starts, so plugin ordering never matters — and reaches
 * the Nitro module through a process global.
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
