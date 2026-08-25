import type { Server } from 'srvx'
import { randomInt } from 'node:crypto'
import { serverFetch } from 'nitro/app'
import { serve } from 'srvx/node'
import { STUDIO_ROUTE } from './constants'

/**
 * Wide random port range: ~15.5 bits of entropy on loopback, so a scanner
 * cannot walk a small, predictable window to find the studio proxy.
 */
const PORT_MIN = 20000
const PORT_MAX = 65536
const PORT_ATTEMPTS = 10

interface StudioServerGlobal {
  __NITRO_DRIZZLE_STUDIO_SERVER__?: Server
}

// Survives nitro dev restarts: a new plugin instance closes the previous
// proxy before binding a fresh port.
const studioServerGlobal = globalThis as unknown as StudioServerGlobal

type Dispatch = (request: Request) => Promise<Response>

export interface StartStudioServerOptions {
  /** Full `Bearer <key>` header value injected on every forwarded request. */
  readonly authorization: string
  /** Base URL of the Studio web app; only its origin may talk to the proxy. */
  readonly studioUrl: string
  /** Fixed port from `drizzle.dev.studio.port`; random when omitted. */
  readonly port?: number
  /** Overridable in-process dispatch; defaults to the Nitro app fetch. */
  readonly dispatch?: Dispatch
}

export interface RunningStudioServer {
  readonly port: number
  close: () => Promise<void>
}

/**
 * Start and close share one serial queue: concurrent starts would otherwise
 * race past each other's close step and leave a listener no later
 * `closeStudioServer()` can reach. Queueing makes every start observe (and
 * replace) the previously registered server.
 */
let lifecycle: Promise<unknown> = Promise.resolve()

function enqueueLifecycle<T>(run: () => Promise<T>): Promise<T> {
  const result = lifecycle.then(run, run)
  lifecycle = result.catch(() => {})
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
  await closeStudioServerLocked()

  // A configured port is a contract: bind it exactly or fail loudly. The
  // default random mode instead retries within the wide range.
  const ports = options.port === undefined
    ? Array.from({ length: PORT_ATTEMPTS }, () => randomInt(PORT_MIN, PORT_MAX))
    : [options.port]

  let lastError: unknown
  for (const port of ports) {
    const server = serve({
      fetch: request => forwardStudioRequest(request, options.authorization, options.studioUrl, dispatch),
      gracefulShutdown: false,
      hostname: '127.0.0.1',
      port,
      silent: true,
    })
    try {
      await server.ready()
      studioServerGlobal.__NITRO_DRIZZLE_STUDIO_SERVER__ = server
      return { port, close: () => server.close() }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code !== 'EADDRINUSE') {
        throw error
      }
      lastError = new Error(
        options.port === undefined
          ? `Failed to find a free port for the Drizzle Studio proxy after ${PORT_ATTEMPTS} attempts.`
          : `Port ${options.port} for the Drizzle Studio proxy is already in use.`,
        { cause: error },
      )
    }
  }
  throw lastError
}

/**
 * The Studio frontend cannot carry credentials, so this loopback proxy is the
 * trust boundary: only the configured Studio origin passes, and the auth key
 * is attached server-side before the request enters the Nitro pipeline.
 */
async function forwardStudioRequest(
  request: Request,
  authorization: string,
  studioUrl: string,
  dispatch: Dispatch,
): Promise<Response> {
  if (request.headers.get('origin') !== new URL(studioUrl).origin) {
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

async function closeStudioServerLocked(): Promise<void> {
  await studioServerGlobal.__NITRO_DRIZZLE_STUDIO_SERVER__?.close()
  studioServerGlobal.__NITRO_DRIZZLE_STUDIO_SERVER__ = undefined
}

/** Startup link printed for the user: the Studio web app plus the proxy port. */
export function studioLink(studioUrl: string, port: number): string {
  const url = new URL(studioUrl)
  url.searchParams.set('port', String(port))
  return url.toString()
}
