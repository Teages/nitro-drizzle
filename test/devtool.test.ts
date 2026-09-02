import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import drizzleDevtool from '../src/devtool'
import { STUDIO_ROUTE } from '../src/studio/contracts'
import { provideDevtoolsKey, readDevtoolsKey } from '../src/studio/devtools-key'

interface DockEntry {
  id: string
  title: string
  icon: string
  type: string
  renderer: { importFrom: string, importName: string }
}

/** Captures what the plugin hands vite-devtools-kit's dock registry. */
function captureDocks() {
  const entries: DockEntry[] = []
  return {
    entries,
    context: { docks: { register: (entry: DockEntry) => entries.push(entry) } },
  }
}

const DATA_MODULE_PREFIX = 'data:text/javascript;base64,'

/** Decodes the renderer module the `importFrom` data URL carries. */
function decodeRenderer(entry: DockEntry): string {
  const { importFrom } = entry.renderer
  expect(importFrom.startsWith(DATA_MODULE_PREFIX)).toBe(true)
  return Buffer.from(importFrom.slice(DATA_MODULE_PREFIX.length), 'base64').toString()
}

describe('@teages/nitro-drizzle/devtool', () => {
  it('registers a custom-render dock whose renderer loads from a data URL', async () => {
    // Given — the plugin's `devtools` hook is typed through
    // @vitejs/devtools-kit, so the test reads it through the minimal shape
    // the setup call actually exercises
    const plugin = drizzleDevtool() as { devtools?: { setup: (context: unknown) => void | Promise<void> } }
    const { entries, context } = captureDocks()

    // When
    await plugin.devtools?.setup(context)

    // Then — the host's own iframe entries cannot express permissions, so
    // the dock hands rendering to the plugin's renderer module; the data URL
    // sidesteps module-graph resolution entirely, which dodged cross-origin
    // trouble with the host's dynamic import
    expect(entries).toEqual([{
      id: 'drizzle-studio',
      title: 'Drizzle Studio',
      icon: 'simple-icons:drizzle',
      type: 'custom-render',
      renderer: {
        importFrom: expect.stringMatching(/^data:text\/javascript;base64,[A-Za-z0-9+/=]+$/),
        importName: 'default',
      },
    }])
  })

  it('renders the keyed studio route with LNA delegation', () => {
    // Given — this session's key, which the route's GET gate compares against
    provideDevtoolsKey('renderer-key')
    const plugin = drizzleDevtool() as { devtools?: { setup: (context: unknown) => void | Promise<void> } }
    const { entries, context } = captureDocks()
    void plugin.devtools?.setup(context)

    // When — the dock host would dynamically import the data URL
    const [entry] = entries
    if (entry === undefined) {
      throw new Error('dock entry missing')
    }
    const source = decodeRenderer(entry)

    // Then — the renderer mounts the same keyed route the iframe dock used
    // to navigate to
    expect(source).toContain(`iframe.src = "${STUDIO_ROUTE}?open=renderer-key"`)
    // And — the iframe delegates local-network-access with the `*` allowlist:
    // Chrome/Edge LNA must cover the Studio origin the route redirects to,
    // not just the same-origin src
    expect(source).toContain(`iframe.setAttribute('allow', 'local-network-access *')`)
    // And — a re-mount must not stack a second iframe in the panel
    expect(source).toContain(`if (el.querySelector('iframe') !== null) {`)
    // And — a restored tab renders its panel before this module's import
    // resolves, so the event above fires with no listener; the renderer
    // must also mount synchronously from the entry state's panel element
    expect(source).toContain('ctx.current.events.on(\'dom:panel:mounted\', mount)')
    expect(source).toContain('const panel = ctx.current.domElements.panel')
    expect(source).toContain('if (panel) {')
  })

  it('keeps one session key across repeated factory calls', () => {
    // Given — Nuxt instantiates several vite configs; a second factory call
    // must not invalidate the URL an already-registered dock embeds
    const first = readDevtoolsKey()

    // When
    drizzleDevtool()
    drizzleDevtool()

    // Then
    expect(readDevtoolsKey()).toBe(first)
  })

  it('stays out of production builds where the studio route cannot exist', () => {
    // Given — DevTools calls devtools.setup in build mode unless a plugin
    // opts out, and the studio route with its key is dev-only
    // When
    const plugin = drizzleDevtool()

    // Then — vite drops the whole plugin from build commands
    expect(plugin.apply).toBe('serve')
  })

  it('lets a caller pin the key, matching what tests pin for the route', () => {
    // When — an explicit key always overwrites the minted one
    provideDevtoolsKey('pinned-key')

    // Then
    expect(readDevtoolsKey()).toBe('pinned-key')
  })
})
