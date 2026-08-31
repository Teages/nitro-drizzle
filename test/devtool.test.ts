import { describe, expect, it } from 'vitest'
import drizzleDevtool from '../src/devtool'
import { STUDIO_ROUTE } from '../src/studio/contracts'
import { provideDevtoolsKey, readDevtoolsKey } from '../src/studio/devtools-key'

interface DockEntry {
  id: string
  title: string
  icon: string
  type: string
  url: string
}

/** Captures what the plugin hands to vite-devtools-kit's dock registry. */
function captureDocks() {
  const entries: DockEntry[] = []
  return {
    entries,
    context: { docks: { register: (entry: DockEntry) => entries.push(entry) } },
  }
}

describe('@teages/nitro-drizzle/devtool', () => {
  it('registers an iframe dock fixed to the keyed studio route', async () => {
    // Given — the plugin's `devtools` hook stays off the public `Plugin`
    // type, so the test reads it through the shape vite-devtools-kit calls
    const plugin = drizzleDevtool() as { devtools?: { setup: (context: unknown) => void | Promise<void> } }
    const { entries, context } = captureDocks()

    // When
    await plugin.devtools?.setup(context)

    // Then — the dock opens the studio route carrying this session's key,
    // which the route's GET gate compares against
    expect(entries).toEqual([{
      id: 'drizzle-studio',
      title: 'Drizzle Studio',
      icon: 'simple-icons:drizzle',
      type: 'iframe',
      url: `${STUDIO_ROUTE}?open=${readDevtoolsKey()}`,
    }])
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
