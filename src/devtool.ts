/// <reference types="@vitejs/devtools-kit" />

import type { Plugin } from 'vite'
import { Buffer } from 'node:buffer'
import { STUDIO_ROUTE } from './studio/contracts'
import { provideDevtoolsKey } from './studio/devtools-key'

/**
 * Adds a Drizzle Studio tab to [Vite DevTools](https://devtools.vite.dev):
 * a custom-render dock on the internal studio route, mounted by the
 * plugin's own renderer so the iframe carries the Local Network Access
 * delegation.
 *
 * Serve-only on purpose: DevTools invokes `devtools.setup` in build mode too
 * (unless a plugin opts out via `capabilities`), but the studio route and its
 * key only exist in dev builds — a build-mode dock would point at a 404.
 */
export default function drizzleDevtool(): Plugin {
  const openKey = provideDevtoolsKey()
  const plugin = {
    name: '@teages/nitro-drizzle/devtool',
    apply: 'serve',
    devtools: {
      setup(ctx) {
        ctx.docks.register({
          id: 'drizzle-studio',
          title: 'Drizzle Studio',
          icon: 'simple-icons:drizzle',
          type: 'custom-render',
          renderer: {
            importFrom: dockRendererSource(openKey),
            importName: 'default',
          },
        })
      },
    },
  } satisfies Plugin
  return plugin
}

/**
 * Source of the dock's renderer module, embedded as a base64 data URL the
 * dock host imports directly. The renderer runs in the app page — the
 * DevTools panel DOM — and mounts the keyed studio route itself, because the
 * dock host's `iframe` entries cannot express permissions: Chrome/Edge Local
 * Network Access only lets the Studio web app (a public origin, reached
 * through the route's redirect) talk to the loopback session host from a
 * delegated iframe. The `*` allowlist is load-bearing — without it the
 * delegation would cover the same-origin src but not the origin redirected
 * to.
 */
function dockRendererSource(openKey: string): string {
  const setupScript = /* js */ `
export default function setup(ctx) {
  const mount = (el) => {
    if (el.querySelector('iframe') !== null) {
      return
    }
    const iframe = document.createElement('iframe')
    iframe.setAttribute('allow', 'local-network-access *')
    iframe.setAttribute('title', 'Drizzle Studio')
    iframe.src = ${JSON.stringify(`${STUDIO_ROUTE}?open=${openKey}`)}
    el.style.cssText = 'position:relative;width:100%;height:100%;'
    iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;'
    el.appendChild(iframe)
  }
  ctx.current.events.on('dom:panel:mounted', mount)
  const panel = ctx.current.domElements.panel
  if (panel) {
    mount(panel)
  }
}
  `
  return `data:text/javascript;base64,${
    Buffer.from(setupScript).toString('base64')}`
}
