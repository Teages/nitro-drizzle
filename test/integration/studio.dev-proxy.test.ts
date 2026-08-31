import type { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
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
 * studio plugin or silence the dev-server logging this test waits on, and
 * restores the development NODE_ENV vitest overrode.
 */
function spawnDevServer(rootDir: string, port: number) {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'development' }
  delete env.VITEST
  delete env.TEST
  const child = spawn(nitroBin, ['dev', '--port', String(port)], {
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

async function postStudio(url: string, body: unknown, origin?: string): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(origin === undefined ? {} : { origin }),
    },
    body: JSON.stringify(body),
  })
}

/**
 * Polls the studio proxy until a query returns the expected rows — the
 * signal that the reloaded worker generation has pushed the new schema and
 * rebound the same port.
 */
async function pollProxyQuery(
  proxyUrl: string,
  sql: string,
  expected: unknown[][],
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastFailure = 'request never ran'
  while (Date.now() < deadline) {
    try {
      const response = await postStudio(proxyUrl, {
        type: 'proxy',
        data: { sql, method: 'values', mode: 'array' },
      }, 'https://local.drizzle.studio')
      if (response.ok) {
        const rows = await response.json()
        if (JSON.stringify(rows) === JSON.stringify(expected)) {
          return
        }
        lastFailure = `rows were ${JSON.stringify(rows)}`
      }
      else {
        lastFailure = `HTTP ${response.status}`
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
      const response = await postStudio(url, { type: 'init' })
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
    const studioPort = await reservePort()
    await writeFile(join(rootDir, 'nitro.config.ts'), `import { defineConfig } from 'nitro/config'
import NitroDrizzle from ${JSON.stringify(resolve(repoRoot, 'src/index'))}

export default defineConfig({
  serverDir: './server',
  modules: [NitroDrizzle],
  drizzle: {
    dialect: 'sqlite',
    driver: 'libsql',
    schemaPath: './server/db/schema.ts',
    devMock: {
      driver: 'node-sqlite',
      studio: { port: ${studioPort} },
    },
    connection: { url: ${JSON.stringify(`file:${join(rootDir, 'dev.db')}`)} },
  },
})
`)

    const { child, waitForOutput } = spawnDevServer(rootDir, httpPort)
    try {
      const proxyUrl = `http://127.0.0.1:${studioPort}/`
      const studioLink = new RegExp(`Drizzle Studio: \\S+port=${studioPort}`)

      // Then — the plugin started the proxy (auth key replaced at build time)
      await waitForOutput(studioLink, 90_000)

      // And the internal route rejects direct access: no key, no studio
      const direct = await waitUntilRouteAnswers(`http://127.0.0.1:${httpPort}/_drizzle/studio`, 90_000)
      expect(direct.status).toBe(401)

      // And the proxy only accepts the Studio web app origin
      const evil = await postStudio(proxyUrl, { type: 'init' }, 'https://evil.example')
      expect(evil.status).toBe(403)

      // And a real Studio handshake reaches the dev database through
      // serverFetch with the injected key
      const init = await postStudio(proxyUrl, { type: 'init' }, 'https://local.drizzle.studio')
      await expect(init.json()).resolves.toMatchObject({
        version: '6.3',
        dialect: 'sqlite',
        driver: 'node-sqlite',
      })

      // And array-mode queries keep their full shape through the proxy
      const probe = await postStudio(proxyUrl, {
        type: 'proxy',
        data: { sql: 'SELECT 1 AS x, 2 AS x', method: 'values', mode: 'array' },
      }, 'https://local.drizzle.studio')
      await expect(probe.json()).resolves.toEqual([[1, 2]])

      // And a worker reload rebinds the fixed port without leaking or losing
      // it: the superseded generation's close hook must not kill the new one
      await writeFile(schemaFile, `import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
})

export const reloadMarkers = sqliteTable('reload_markers', {
  id: integer('id').primaryKey(),
})
`)
      // The link prints once per dev-server run (the module resolves the
      // port, so it is stable across worker generations); the reload itself
      // is observed through the proxy: only the new generation pushes and
      // serves the new table on the same port.
      await pollProxyQuery(proxyUrl, 'SELECT count(*) AS n FROM reload_markers', [[0]], 90_000)
      const afterReload = await postStudio(proxyUrl, { type: 'init' }, 'https://local.drizzle.studio')
      expect(afterReload.status).toBe(200)

      // And the dev server terminates on SIGTERM — a leaked studio listener
      // would keep the process alive
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
