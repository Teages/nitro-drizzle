import type { DrizzleDialect, DrizzleLocalDriver } from '../../types'
import type { StudioExecutor, StudioQuery } from './adapters'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { studioLink } from '../link'

/** Protocol version the Studio web app accepts (6 … 6.3). */
const STUDIO_PROTOCOL_VERSION = '6.3'

const PACKAGE_BY_ENGINE: Readonly<Record<DrizzleLocalDriver, string>> = {
  'pglite': '@electric-sql/pglite',
  'better-sqlite3': 'better-sqlite3',
  'libsql': '@libsql/client',
  'bun-sqlite': 'bun:sqlite',
  'node-sqlite': 'node:sqlite',
}

export const studioCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Access-Control-Request-Private-Network',
  'Access-Control-Allow-Private-Network': 'true',
} as const

/**
 * Upper bound for `bproxy` benchmark repeats. A single query per iteration is
 * cheap, but an unbounded repeat count would monopolize the dev worker for
 * the whole run.
 */
const BPROXY_MAX_REPEATS = 100

function isBproxyRepeats(value: unknown): boolean {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 1
    && value <= BPROXY_MAX_REPEATS
}

/** Inputs to the Studio `init` response, taken from `#drizzle/config`. */
export interface StudioInitContext {
  readonly dialect: DrizzleDialect
  readonly engine: DrizzleLocalDriver
  readonly connection: string | undefined
}

export function validateStudioAuthorization(
  authKey: string | undefined,
  authorization: string | null,
): 'not-configured' | 'unauthorized' | undefined {
  if (authKey === undefined || authKey === '') {
    return 'not-configured'
  }
  if (authorization !== `Bearer ${authKey}`) {
    return 'unauthorized'
  }
  return undefined
}

/** Facts the keyed GET redirect decision is derived from. */
export interface StudioDevtoolsRedirectInput {
  /** Per-session devtools key from the `devtool` plugin's replace marker. */
  readonly key: string | undefined
  readonly method: string
  /** Parsed `open` query value; anything but the exact key keeps it closed. */
  readonly open: unknown
  /** Port the request arrived on — the browser-facing dev server port. */
  readonly requestPort: string
  /** Studio session the redirect targets; absent when the studio is off. */
  readonly studio: {
    readonly studioUrl: string
    readonly localhostDomain: string
  } | undefined
}

/**
 * Resolves the Studio page URL a keyed GET on the studio route redirects to,
 * or `undefined` when the request is not the devtools iframe's navigation.
 * The target comes from validated build-time config only — the query key
 * gates the redirect, it never shapes it, so a leaked key cannot turn the
 * route into an open redirect.
 */
export function studioDevtoolsRedirect(
  input: StudioDevtoolsRedirectInput,
): string | undefined {
  if (input.key === undefined || input.studio === undefined) {
    return undefined
  }
  if (input.method !== 'GET' || input.open !== input.key) {
    return undefined
  }
  return studioLink(input.studio.studioUrl, input.studio.localhostDomain, input.requestPort)
}

interface StudioProxyData {
  sql: string
  params?: unknown[]
  mode?: 'array' | 'object'
  method?: StudioQuery['method']
}

type StudioRequest
  = | { type: 'init' }
    | { type: 'proxy', data: StudioProxyData }
    | { type: 'tproxy', data: Array<{ sql: string, method?: StudioProxyData['method'] }> }
    | { type: 'bproxy', data: { query: StudioProxyData, repeats?: number } }
    | { type: 'defaults', data: Array<{ schema: string, table: string, column: string }> }

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null
}

function isSerializedBuffer(
  value: unknown,
): value is { type: 'Buffer', data: number[] } {
  return isRecord(value)
    && value.type === 'Buffer'
    && Array.isArray(value.data)
    && value.data.every(item => typeof item === 'number')
}

function isStudioProxyData(value: unknown): value is StudioProxyData {
  if (!isRecord(value) || typeof value.sql !== 'string') {
    return false
  }
  if (value.params !== undefined && !Array.isArray(value.params)) {
    return false
  }
  if (value.mode !== undefined && value.mode !== 'array' && value.mode !== 'object') {
    return false
  }
  return value.method === undefined
    || ['values', 'get', 'all', 'run', 'execute'].includes(String(value.method))
}

function isStudioRequest(value: unknown): value is StudioRequest {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false
  }

  switch (value.type) {
    case 'init':
      return true
    case 'proxy':
      return isStudioProxyData(value.data)
    case 'tproxy':
      return Array.isArray(value.data)
        && value.data.every(item => isRecord(item) && isStudioProxyData(item))
    case 'bproxy':
      return isRecord(value.data)
        && isStudioProxyData(value.data.query)
        && (value.data.repeats === undefined || isBproxyRepeats(value.data.repeats))
    case 'defaults':
      return Array.isArray(value.data)
        && value.data.every(item => isRecord(item)
          && typeof item.schema === 'string'
          && typeof item.table === 'string'
          && typeof item.column === 'string')
    default:
      return false
  }
}

function assertNever(value: never): never {
  throw new Error(`Unknown Studio protocol type: ${JSON.stringify(value)}`)
}

function studioJson(data: unknown): string {
  return JSON.stringify(data, (_key, value: unknown) => {
    if (value instanceof Error) {
      return { error: value.message }
    }
    if (value instanceof Date) {
      return value.toISOString()
    }
    if (typeof value === 'bigint') {
      return value.toString()
    }
    if (isSerializedBuffer(value)) {
      return Buffer.from(value.data).toString('base64')
    }
    if (value instanceof ArrayBuffer) {
      return Buffer.from(new Uint8Array(value)).toString('base64')
    }
    if (value instanceof Uint8Array) {
      return Buffer.from(value).toString('base64')
    }
    return value
  })
}

function studioRowsResponse(rows: unknown): Response {
  return new Response(studioJson(rows), {
    headers: {
      ...studioCorsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function studioError(error: unknown, status: number): Response {
  const message = error instanceof Error ? error.message : String(error)
  return Response.json({
    status: 'error',
    error: message,
  }, {
    status,
    headers: studioCorsHeaders,
  })
}

/**
 * Studio keys its localStorage state per database; hashing the engine plus
 * the dev connection keeps separate dev databases from sharing cached
 * schema state. No connection secrets are involved — the dev database only
 * ever points at an in-memory or explicitly configured local file.
 */
export function studioDatabaseHash(ctx: StudioInitContext): string {
  return createHash('sha256')
    .update(`drizzle-studio|${ctx.dialect}|${ctx.engine}|${ctx.connection ?? ':memory:'}`)
    .digest('hex')
}

function studioDatabaseName(ctx: StudioInitContext): string {
  if (ctx.connection === undefined || ctx.connection === ':memory:') {
    return ctx.connection ?? 'memory'
  }
  const withoutProtocol = ctx.connection.replace(/^(?:file|libsql):\/\//, '').replace(/^file:/, '')
  const segments = withoutProtocol.split('/').filter(segment => segment !== '')
  return segments.at(-1) ?? withoutProtocol
}

function studioInitResponse(ctx: StudioInitContext): Response {
  return Response.json({
    version: STUDIO_PROTOCOL_VERSION,
    dialect: ctx.dialect,
    driver: ctx.engine,
    packageName: PACKAGE_BY_ENGINE[ctx.engine],
    schemaFiles: [],
    customDefaults: [],
    relations: [],
    dbHash: studioDatabaseHash(ctx),
    databaseName: studioDatabaseName(ctx),
  }, { headers: studioCorsHeaders })
}

export async function handleStudioProtocol(
  executor: StudioExecutor,
  init: StudioInitContext,
  body: unknown,
): Promise<Response> {
  if (!isStudioRequest(body)) {
    return studioError('Invalid Studio protocol request', 400)
  }

  try {
    switch (body.type) {
      case 'init': {
        return studioInitResponse(init)
      }
      case 'proxy': {
        return studioRowsResponse(await executor.query(body.data))
      }
      case 'tproxy': {
        return studioRowsResponse(await executor.transaction(body.data))
      }
      case 'bproxy': {
        const repeats = body.data.repeats ?? 1
        const timings: number[] = []
        for (let i = 0; i < repeats; i++) {
          const start = performance.now()
          await executor.query(body.data.query)
          timings.push(performance.now() - start)
        }
        return studioRowsResponse(timings)
      }
      case 'defaults': {
        throw new Error('Custom defaults are not configured')
      }
      default: {
        return assertNever(body)
      }
    }
  }
  catch (error) {
    return studioError(error, 500)
  }
}
