import type { RunningStudioServer } from '../../../src/studio/runtime/proxy-server'
import { createServer } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeStudioServer, startStudioServer, studioLifecycle, studioLink } from '../../../src/studio/runtime/proxy-server'

const dispatched: Request[] = []

const dispatch = vi.fn(async (request: Request) => {
  dispatched.push(request)
  return Response.json({ ok: true, path: new URL(request.url).pathname })
})

const STUDIO_URL = 'https://local.drizzle.studio'

afterEach(async () => {
  await closeStudioServer()
  dispatched.length = 0
  dispatch.mockClear()
})

async function reservePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}

describe('startStudioServer', () => {
  it('listens on a random port inside the wide range', async () => {
    const server = await startStudioServer({ authorization: 'Bearer test', studioUrl: STUDIO_URL, dispatch })
    expect(server.port).toBeGreaterThanOrEqual(20000)
    expect(server.port).toBeLessThan(65536)
  })

  it('honors a fixed port when one is configured', async () => {
    const port = await reservePort()
    const server = await startStudioServer({ authorization: 'Bearer test', studioUrl: STUDIO_URL, port, dispatch })
    expect(server.port).toBe(port)
  })

  it('fails with a clear error when the fixed port is occupied', async () => {
    // Given — a listener squatting on the configured port
    const squatter = createServer()
    await new Promise<void>(resolve => squatter.listen(0, '127.0.0.1', resolve))
    const { port } = squatter.address() as { port: number }

    // When / Then — no silent fallback to another port
    await expect(
      startStudioServer({ authorization: 'Bearer test', studioUrl: STUDIO_URL, port, dispatch }),
    ).rejects.toThrow(`Port ${port} for the Drizzle Studio proxy is already in use.`)
    await new Promise<void>(resolve => squatter.close(() => resolve()))
  })

  it('rejects requests whose origin is not the Studio web app', async () => {
    // Given
    const server = await startStudioServer({ authorization: 'Bearer test', studioUrl: STUDIO_URL, dispatch })

    // When
    const evil = await fetch(`http://127.0.0.1:${server.port}/`, {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
      body: JSON.stringify({ type: 'init' }),
    })
    const noOrigin = await fetch(`http://127.0.0.1:${server.port}/`, {
      method: 'POST',
      body: JSON.stringify({ type: 'init' }),
    })

    // Then
    expect(evil.status).toBe(403)
    expect(noOrigin.status).toBe(403)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('accepts a custom studioUrl and enforces its origin instead', async () => {
    // Given — a self-hosted Studio frontend origin
    const server = await startStudioServer({
      authorization: 'Bearer test',
      studioUrl: 'http://localhost:5173/studio/',
      dispatch,
    })

    // When
    const official = await fetch(`http://127.0.0.1:${server.port}/`, {
      method: 'POST',
      headers: { origin: STUDIO_URL },
      body: JSON.stringify({ type: 'init' }),
    })
    const selfHosted = await fetch(`http://127.0.0.1:${server.port}/`, {
      method: 'POST',
      headers: { origin: 'http://localhost:5173' },
      body: JSON.stringify({ type: 'init' }),
    })

    // Then — origin ignores the path component and rejects other origins
    expect(official.status).toBe(403)
    expect(selfHosted.status).toBe(200)
  })

  it('forwards Studio requests to the internal route with the auth key attached', async () => {
    // Given
    const server = await startStudioServer({ authorization: 'Bearer test', studioUrl: STUDIO_URL, dispatch })

    // When — a request shaped like the Studio frontend's own traffic
    const response = await fetch(`http://127.0.0.1:${server.port}/`, {
      method: 'POST',
      headers: {
        'origin': STUDIO_URL,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ type: 'init' }),
    })

    // Then
    await expect(response.json()).resolves.toMatchObject({ ok: true, path: '/_drizzle/studio' })
    expect(dispatched).toHaveLength(1)
    expect(dispatched[0].headers.get('authorization')).toBe('Bearer test')
    expect(dispatched[0].headers.get('origin')).toBe(STUDIO_URL)
  })

  it('replaces the previous proxy on restart', async () => {
    // Given
    const first = await startStudioServer({ authorization: 'Bearer one', studioUrl: STUDIO_URL, dispatch })

    // When
    const second = await startStudioServer({ authorization: 'Bearer two', studioUrl: STUDIO_URL, dispatch })
    const previous = await fetch(`http://127.0.0.1:${first.port}/`, {
      method: 'POST',
      headers: { origin: STUDIO_URL },
      body: '{}',
    }).catch((error: unknown) => error)

    // Then
    expect(second.port).not.toBe(first.port)
    expect(previous).toBeInstanceOf(Error)
  })

  it('closes every listener after concurrent starts', async () => {
    // Given — the plugin does not await startup, so two starts can overlap;
    // without serialization one listener escapes the global and survives close
    const [first, second] = await Promise.all([
      startStudioServer({ authorization: 'Bearer test', studioUrl: STUDIO_URL, dispatch }),
      startStudioServer({ authorization: 'Bearer test', studioUrl: STUDIO_URL, dispatch }),
    ])

    // When
    await closeStudioServer()

    // Then — both ports refuse connections; no leaked listener blocks exit
    for (const port of [first.port, second.port]) {
      const probe = await fetch(`http://127.0.0.1:${port}/`, {
        method: 'POST',
        headers: { origin: STUDIO_URL },
      }).then(() => 'open', () => 'closed')
      expect(probe).toBe('closed')
    }
  })

  it('serializes starts across module reload generations', async () => {
    // Given — nitro dev reloads re-evaluate this module in the worker; the
    // query suffix forces vitest to create that second generation
    const specifier = '../../../src/studio/runtime/proxy-server?generation=2'
    const next = await import(specifier) as typeof import('../../../src/studio/runtime/proxy-server')

    // When
    const [first, second] = await Promise.all([
      startStudioServer({ authorization: 'Bearer test', studioUrl: STUDIO_URL, dispatch }),
      next.startStudioServer({ authorization: 'Bearer test', studioUrl: STUDIO_URL, dispatch }),
    ])
    await next.closeStudioServer()

    // Then — the shared global queue let one close reach both generations'
    // listeners; module-local queues would leak the loser's port
    for (const port of [first.port, second.port]) {
      const probe = await fetch(`http://127.0.0.1:${port}/`, {
        method: 'POST',
        headers: { origin: STUDIO_URL },
      }).then(() => 'open', () => 'closed')
      expect(probe).toBe('closed')
    }
  })

  it('keeps the replacement proxy alive when a superseded generation closes late', async () => {
    // Given — generation B replaced generation A; A's nitro close hook fires
    // after B already started
    const first = await startStudioServer({ authorization: 'Bearer test', studioUrl: STUDIO_URL, dispatch })
    const second = await startStudioServer({ authorization: 'Bearer test', studioUrl: STUDIO_URL, dispatch })
    expect(second.port).not.toBe(first.port)

    // When — A closes only what it started
    await first.close()

    // Then — B is unaffected and still serves Studio traffic
    const bState = await fetch(`http://127.0.0.1:${second.port}/`, {
      method: 'POST',
      headers: { origin: STUDIO_URL },
    }).then(() => 'open', () => 'closed')
    expect(bState).toBe('open')

    // And B's own close still works
    await second.close()
    const afterClose = await fetch(`http://127.0.0.1:${second.port}/`, {
      method: 'POST',
      headers: { origin: STUDIO_URL },
    }).then(() => 'open', () => 'closed')
    expect(afterClose).toBe('closed')
  })
})

describe('studioLink', () => {
  it('appends the port as a query parameter without clobbering existing ones', () => {
    expect(studioLink(STUDIO_URL, 1234)).toBe('https://local.drizzle.studio/?port=1234')
    expect(studioLink('http://localhost:5173/studio?token=x', 99)).toBe('http://localhost:5173/studio?token=x&port=99')
  })
})

describe('studioLifecycle', () => {
  it('closes a proxy whose startup resolves after the close hook', async () => {
    // Given — nitro closes before the queued start finishes binding; the
    // startup is gated so the hook observably runs first
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolvePromise => release = resolvePromise)
    let started: RunningStudioServer | undefined
    const lifecycle = studioLifecycle({
      start: () => gate.then(() =>
        startStudioServer({ authorization: 'Bearer test', studioUrl: STUDIO_URL, dispatch })),
      onReady: server => (started = server),
    })

    // When — the close hook fires, then the startup lands afterwards
    const closing = lifecycle.onClose()
    release!()
    await closing

    // Then — the awaited hook still ownership-closed the late listener;
    // a synchronous handle read would have leaked it
    expect(started).toBeDefined()
    const probe = await fetch(`http://127.0.0.1:${started!.port}/`, {
      method: 'POST',
      headers: { origin: STUDIO_URL },
    }).then(() => 'open', () => 'closed')
    expect(probe).toBe('closed')
  })

  it('does not reject the close hook when the startup failed', async () => {
    // Given — the startup rejects; the error is surfaced through onError
    const errors: unknown[] = []
    const lifecycle = studioLifecycle({
      start: () => Promise.reject(new Error('boom')),
      onError: error => errors.push(error),
    })

    // When / Then — the close hook resolves; failures were reported once
    await expect(lifecycle.onClose()).resolves.toBeUndefined()
    expect(errors).toHaveLength(1)
  })
})
