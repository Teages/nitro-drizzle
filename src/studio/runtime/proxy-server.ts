import type { Server } from 'srvx'
import { serverFetch } from 'nitro/app'
import { serve } from 'srvx/node'
import { STUDIO_ROUTE } from '../contracts'

interface StudioServerGlobal {
  __NITRO_DRIZZLE_STUDIO_SERVER__?: Server
  __NITRO_DRIZZLE_STUDIO_LIFECYCLE__?: Promise<unknown>
}

// Survives nitro dev restarts: a new plugin instance closes the previous
// proxy before binding a fresh port. The lifecycle queue lives here too —
// nitro re-evaluates this module in the worker on reload, and separate
// module-local queues would let two generations race past each other's close.
const studioServerGlobal = globalThis as unknown as StudioServerGlobal

type Dispatch = (request: Request) => Promise<Response>

export interface StartStudioServerOptions {
  /** Full `Bearer <key>` header value injected on every forwarded request. */
  readonly authorization: string
  /** Base URL of the Studio web app; only its origin may talk to the proxy. */
  readonly studioUrl: string
  /** Port the module resolved (configured or probed); bound exactly, never replaced. */
  readonly port: number
  /** Per-session `<uuid>.localhost` domain; `undefined` keeps plain loopback hosts. */
  readonly localhostDomain?: string
  /** Overridable in-process dispatch; defaults to the Nitro app fetch. */
  readonly dispatch?: Dispatch
}

export interface RunningStudioServer {
  readonly port: number
  /**
   * Closes this proxy only while it is still the registered one: a superseded
   * generation's close hook must not kill its replacement.
   */
  close: () => Promise<void>
}

/** Start and close share one queue so concurrent starts can't race past each other's close. */
function enqueueLifecycle<T>(run: () => Promise<T>): Promise<T> {
  const result = (studioServerGlobal.__NITRO_DRIZZLE_STUDIO_LIFECYCLE__ ?? Promise.resolve())
    .then(run, run)
  studioServerGlobal.__NITRO_DRIZZLE_STUDIO_LIFECYCLE__ = result.catch(() => {})
  return result
}

export function startStudioServer(
  options: StartStudioServerOptions,
): Promise<RunningStudioServer> {
  return enqueueLifecycle(() => startStudioServerQueued(options))
}

async function startStudioServerQueued(
  options: StartStudioServerOptions,
): Promise<RunningStudioServer> {
  const dispatch = options.dispatch ?? ((request: Request) => serverFetch(request))
  const allowedHosts = studioHostAllowlist(options.port, options.localhostDomain)
  const studioOrigin = new URL(options.studioUrl).origin
  await closeStudioServerLocked()

  // The module printed the studio link with this port: binding anything
  // else would desync the link, so an occupied port fails loudly instead.
  const server = serve({
    fetch: request => forwardStudioRequest(request, options.authorization, studioOrigin, allowedHosts, dispatch),
    gracefulShutdown: false,
    hostname: '127.0.0.1',
    port: options.port,
    silent: true,
  })
  try {
    await server.ready()
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === 'EADDRINUSE') {
      throw new Error(
        `Port ${options.port} for the Drizzle Studio proxy is already in use.`,
        { cause: error },
      )
    }
    throw error
  }
  studioServerGlobal.__NITRO_DRIZZLE_STUDIO_SERVER__ = server
  return {
    port: options.port,
    close: () => closeStudioServerIfOwner(server),
  }
}

/**
 * Host authorities the proxy answers to, always port-qualified. With a
 * per-session domain the unguessable hostname is the capability: probes
 * that found the port but not the domain are rejected before any protocol
 * handling, and rebinding a foreign name onto loopback cannot present it.
 * The plain-loopback mode keeps the two spellings a browser may use.
 */
function studioHostAllowlist(
  port: number,
  localhostDomain: string | undefined,
): ReadonlySet<string> {
  return new Set(
    localhostDomain === undefined
      ? [`localhost:${port}`, `127.0.0.1:${port}`]
      : [`${localhostDomain}:${port}`],
  )
}

/**
 * The Studio frontend cannot carry credentials, so this loopback proxy is the
 * trust boundary: only the configured Studio origin and Host pass, and the
 * auth key is attached server-side before the request enters the Nitro
 * pipeline.
 */
async function forwardStudioRequest(
  request: Request,
  authorization: string,
  studioOrigin: string,
  allowedHosts: ReadonlySet<string>,
  dispatch: Dispatch,
): Promise<Response> {
  if (!allowedHosts.has(request.headers.get('host') ?? '')) {
    return new Response('Forbidden', { status: 403 })
  }
  if (request.headers.get('origin') !== studioOrigin) {
    return new Response('Forbidden', { status: 403 })
  }
  const forwarded = new Request(`http://drizzle-studio.local${STUDIO_ROUTE}`, request)
  forwarded.headers.delete('host')
  forwarded.headers.delete('connection')
  forwarded.headers.set('authorization', authorization)
  return dispatch(forwarded)
}

/** Closes the running proxy if this process still owns one. */
export function closeStudioServer(): Promise<void> {
  return enqueueLifecycle(closeStudioServerLocked)
}

export interface StudioLifecycle {
  /** Waits out the startup, then closes only what this generation started. */
  onClose: () => Promise<void>
}

/**
 * The close hook awaits the startup: closing mid-boot would no-op and let
 * the queued start land a listener nobody closes. Startup errors go to
 * `onError` — a failed start must not reject the close hook.
 */
export function studioLifecycle(options: {
  start: () => Promise<RunningStudioServer>
  onReady?: (server: RunningStudioServer) => void
  onError?: (error: unknown) => void
}): StudioLifecycle {
  let running: RunningStudioServer | undefined
  const startup = options.start().then(
    (server) => {
      running = server
      options.onReady?.(server)
      return server
    },
    (error: unknown) => {
      options.onError?.(error)
      return undefined
    },
  )
  return {
    onClose: async () => {
      await startup
      await running?.close()
    },
  }
}

/** Closes `server` only while it is still the registered proxy. */
function closeStudioServerIfOwner(server: Server): Promise<void> {
  return enqueueLifecycle(async () => {
    if (studioServerGlobal.__NITRO_DRIZZLE_STUDIO_SERVER__ === server) {
      await closeStudioServerLocked()
    }
  })
}

async function closeStudioServerLocked(): Promise<void> {
  await studioServerGlobal.__NITRO_DRIZZLE_STUDIO_SERVER__?.close()
  studioServerGlobal.__NITRO_DRIZZLE_STUDIO_SERVER__ = undefined
}
