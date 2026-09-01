import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { connect, createServer } from 'node:net'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const repoRoot = process.cwd()
const temporaryDirectories: string[] = []
const nitroBin = join(repoRoot, 'node_modules/.bin/nitro')

async function reservePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolvePromise =>
    server.listen(0, '127.0.0.1', resolvePromise),
  )
  const { port } = server.address() as { port: number }
  await new Promise<void>(resolvePromise =>
    server.close(() => resolvePromise()),
  )
  return port
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(path =>
      rm(path, { recursive: true, force: true }),
    ),
  )
})

/**
 * Spawns a real `nitro dev` server with the studio enabled. The child env
 * drops the test markers (`VITEST`, `TEST`) that would short-circuit the
 * studio wiring or silence the dev-server logging this test waits on, and
 * restores the development NODE_ENV vitest overrode. The listening port
 * comes from the generated config's `devServer.port` — the same source the
 * module reads for the printed link.
 */
function spawnDevServer(rootDir: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'development' }
  delete env.VITEST
  delete env.TEST
  const child = spawn(nitroBin, ['dev'], {
    cwd: rootDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  const append = (chunk: Buffer) => {
    output += chunk.toString()
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  return {
    child,
    waitForOutput: (pattern: RegExp, timeoutMs: number) =>
      new Promise<string>((resolvePromise, rejectPromise) => {
        const started = Date.now()
        const timer = setInterval(() => {
          const match = output.match(pattern)
          if (match !== null) {
            clearInterval(timer)
            resolvePromise(match[0])
          }
          else if (Date.now() - started > timeoutMs) {
            clearInterval(timer)
            rejectPromise(new Error(
              `Dev server output never matched ${String(pattern)}. Last output:\n${output.slice(-2000)}`,
            ))
          }
        }, 250)
      }),
  }
}

async function postStudio(url: string, body: unknown, origin?: string, signal?: AbortSignal): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(origin === undefined ? {} : { origin }),
    },
    body: JSON.stringify(body),
    signal,
  })
}

/**
 * Node's fetch follows the spec and refuses a `Host` header, so proxy
 * traffic shaped for the per-session domain goes over a raw socket with a
 * hand-written request line. HTTP/1.0 keeps the response free of chunked
 * framing and `Connection: close` ends the stream, so the full response
 * drains before the promise settles.
 */
function rawStudioRequest(
  port: number,
  host: string,
  body: string,
  origin?: string,
): Promise<{ status: number, body: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = connect(port, '127.0.0.1')
    socket.setTimeout(10_000)
    let raw = ''
    socket
      .on('connect', () => {
        socket.write([
          'POST /_drizzle/studio HTTP/1.0',
          `Host: ${host}`,
          ...(origin === undefined ? [] : [`Origin: ${origin}`]),
          'Content-Type: application/json',
          `Content-Length: ${Buffer.byteLength(body)}`,
          'Connection: close',
          '',
          body,
        ].join('\r\n'))
      })
      .on('data', (chunk: Buffer) => {
        raw += chunk.toString()
      })
      .on('end', () => {
        const headerBlock = raw.slice(0, raw.indexOf('\r\n\r\n'))
        const status = Number((headerBlock.split('\r\n')[0] ?? '').split(' ')[1])
        resolvePromise({ status, body: raw.slice(headerBlock.length + 4) })
      })
      .on('timeout', () => socket.destroy(new Error(`Studio proxy request to ${host} timed out`)))
      .on('error', rejectPromise)
  })
}

/**
 * Polls the studio route until a query returns the expected rows — the
 * signal that the reloaded worker generation has pushed the new schema.
 */
async function pollProxyQuery(
  port: number,
  localhostDomain: string,
  sql: string,
  expected: unknown[][],
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastFailure = 'request never ran'
  while (Date.now() < deadline) {
    try {
      const { status, body } = await rawStudioRequest(
        port,
        `${localhostDomain}:${port}`,
        JSON.stringify({ type: 'proxy', data: { sql, method: 'values', mode: 'array' } }),
        'https://local.drizzle.studio',
      )
      if (status === 200) {
        const rows: unknown = JSON.parse(body)
        if (JSON.stringify(rows) === JSON.stringify(expected)) {
          return
        }
        lastFailure = `rows were ${JSON.stringify(rows)}`
      }
      else {
        lastFailure = `HTTP ${status}`
      }
    }
    catch (error) {
      lastFailure = String(error)
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 500))
  }
  throw new Error(`Studio proxy never served ${JSON.stringify(sql)}: ${lastFailure}`)
}

/**
 * The studio link prints at module setup, before the dev server accepts
 * traffic — Nitro dev answers 503 while the worker is still booting and the
 * listener may not exist yet — so this polls until the route actually
 * answers, then lets the caller assert on the response.
 */
async function waitUntilRouteAnswers(url: string, timeoutMs: number): Promise<Response> {
  const deadline = Date.now() + timeoutMs
  let lastFailure = 'request never ran'
  while (Date.now() < deadline) {
    try {
      const response = await postStudio(url, { type: 'init' }, undefined, AbortSignal.timeout(deadline - Date.now()))
      if (response.status !== 503) {
        return response
      }
      lastFailure = 'HTTP 503 (dev server still booting)'
    }
    catch (error) {
      lastFailure = String(error)
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 500))
  }
  throw new Error(`Route ${url} never answered: ${lastFailure}`)
}

describe('studio dev proxy end to end', () => {
  it('serves, guards, reloads, and shuts down the studio proxy', { timeout: 300_000 }, async () => {
    // Given — a throwaway Nitro app with the dev database and a fixed studio
    // port, exactly how a user runs it
    const rootDir = await mkdtemp(join(repoRoot, '.test-studio-e2e-'))
    temporaryDirectories.push(rootDir)
    await mkdir(join(rootDir, 'server/db'), { recursive: true })
    const schemaFile = join(rootDir, 'server/db/schema.ts')
    await writeFile(schemaFile, `import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
})
`)
    const httpPort = await reservePort()
    const devtoolsKey = 'e2e-studio-devtools-key'
    await writeFile(join(rootDir, 'nitro.config.ts'), `import { defineConfig } from 'nitro/config'
import NitroDrizzle from ${JSON.stringify(resolve(repoRoot, 'src/index'))}
import { provideDevtoolsKey } from ${JSON.stringify(resolve(repoRoot, 'src/studio/devtools-key'))}

// Stands in for the devtool Vite plugin, which mints this key in the same
// process before the build starts
provideDevtoolsKey(${JSON.stringify(devtoolsKey)})

export default defineConfig({
  serverDir: './server',
  devServer: { port: ${httpPort} },
  modules: [NitroDrizzle],
  drizzle: {
    dialect: 'sqlite',
    driver: 'libsql',
    schemaPath: './server/db/schema.ts',
    devMock: {
      driver: 'node-sqlite',
      studio: {},
    },
    connection: { url: ${JSON.stringify(`file:${join(rootDir, 'dev.db')}`)} },
  },
})
`)

    const { child, waitForOutput } = spawnDevServer(rootDir)
    try {
      const proxyHost = (domain: string): string => `${domain}:${httpPort}`

      // Then — the module printed the studio link for the dev server port
      // under its per-session *.localhost domain
      const linkLog = await waitForOutput(
        new RegExp(`Drizzle Studio: \\S+port=${httpPort}&host=[\\w.-]+\\.localhost`),
        90_000,
      )
      const localhostDomain = /&host=([\w.-]+)/.exec(linkLog)?.[1] ?? ''
      expect(localhostDomain).toMatch(/^[0-9a-f-]{36}\.localhost$/)

      // And the internal route rejects direct access: no key, no studio
      const direct = await waitUntilRouteAnswers(`http://127.0.0.1:${httpPort}/_drizzle/studio`, 90_000)
      expect(direct.status).toBe(401)

      // And the keyed devtools GET redirects to the studio page: the iframe
      // carries no credentials, so the redirect settles before the bearer gate
      const devtools = await fetch(
        `http://127.0.0.1:${httpPort}/_drizzle/studio?open=${devtoolsKey}`,
        { redirect: 'manual' },
      )
      expect(devtools.status).toBe(302)
      expect(devtools.headers.get('location'))
        .toBe(`https://local.drizzle.studio/?port=${httpPort}&host=${localhostDomain}`)

      // And any other GET — wrong key, or none — keeps meeting the bearer gate
      const wrongKey = await fetch(
        `http://127.0.0.1:${httpPort}/_drizzle/studio?open=not-the-key`,
        { redirect: 'manual' },
      )
      expect(wrongKey.status).toBe(401)
      const unkeyed = await fetch(
        `http://127.0.0.1:${httpPort}/_drizzle/studio`,
        { redirect: 'manual' },
      )
      expect(unkeyed.status).toBe(401)

      // And the session domain only opens for the Studio web app origin
      const evil = await rawStudioRequest(
        httpPort,
        proxyHost(localhostDomain),
        JSON.stringify({ type: 'init' }),
        'https://evil.example',
      )
      expect(evil.status).toBe(403)

      // And the port-scan shape — the very port the app runs on, even with
      // the right origin, but no session Host — keeps meeting the bearer
      // gate: the domain, not the port, is the capability
      const byIp = await rawStudioRequest(
        httpPort,
        `127.0.0.1:${httpPort}`,
        JSON.stringify({ type: 'init' }),
        'https://local.drizzle.studio',
      )
      expect(byIp.status).toBe(401)

      // And a real Studio handshake — session Host plus Studio origin —
      // reaches the dev database with the gate-injected key
      const init = await rawStudioRequest(
        httpPort,
        proxyHost(localhostDomain),
        JSON.stringify({ type: 'init' }),
        'https://local.drizzle.studio',
      )
      expect(JSON.parse(init.body)).toMatchObject({
        version: '6.3',
        dialect: 'sqlite',
        driver: 'node-sqlite',
      })

      // And array-mode queries keep their full shape through the gate
      const probe = await rawStudioRequest(
        httpPort,
        proxyHost(localhostDomain),
        JSON.stringify({ type: 'proxy', data: { sql: 'SELECT 1 AS x, 2 AS x', method: 'values', mode: 'array' } }),
        'https://local.drizzle.studio',
      )
      expect(JSON.parse(probe.body)).toEqual([[1, 2]])

      // And a worker reload keeps serving the studio on the same route
      await writeFile(schemaFile, `import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
})

export const reloadMarkers = sqliteTable('reload_markers', {
  id: integer('id').primaryKey(),
})
`)
      // The reload itself is observed through the gated route: only the new
      // generation pushes and serves the new table.
      await pollProxyQuery(httpPort, localhostDomain, 'SELECT count(*) AS n FROM reload_markers', [[0]], 90_000)
      const afterReload = await rawStudioRequest(
        httpPort,
        proxyHost(localhostDomain),
        JSON.stringify({ type: 'init' }),
        'https://local.drizzle.studio',
      )
      expect(afterReload.status).toBe(200)

      // And the dev server terminates on SIGTERM — a wedged worker would
      // keep the process alive
      child.kill('SIGTERM')
      const outcome = await new Promise<{ code: number | null, signal: string | null } | null>(
        (resolvePromise) => {
          const forceKill = setTimeout(resolvePromise, 30_000, null)
          child.once('exit', (code, signal) => {
            clearTimeout(forceKill)
            resolvePromise({ code, signal })
          })
        },
      )
      if (outcome === null) {
        child.kill('SIGKILL')
        throw new Error('Dev server did not exit on SIGTERM — a leaked listener blocks shutdown')
      }
      // Terminating via the SIGTERM signal is the graceful path for
      // `nitro dev`; what matters is that the process actually exited.
      expect(['SIGTERM', 'SIGINT'].includes(outcome.signal ?? '') || outcome.code === 0).toBe(true)
    }
    finally {
      // Cleanup for failure paths: the success path already exited the child.
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL')
      }
    }
  })
})
