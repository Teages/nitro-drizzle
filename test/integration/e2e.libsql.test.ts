import type { AddressInfo } from 'node:net'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'
import { createClient } from '@libsql/client'
import { build, createNitro } from 'nitro/builder'
import { afterEach, describe, expect, it } from 'vitest'
import { copyFixture, fixtureMigrationNames, fixtureMigrationsFolder } from './fixtures'

const repoRoot = process.cwd()
const temporaryDirectories: string[] = []
const childProcesses: ReturnType<typeof spawn>[] = []

afterEach(async () => {
  for (const child of childProcesses.splice(0)) {
    child.kill('SIGTERM')
    await new Promise<void>(resolve => child.on('exit', () => resolve()))
  }
  await Promise.all(
    temporaryDirectories.splice(0).map(path =>
      rm(path, { recursive: true, force: true }),
    ),
  )
})

async function reservePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve))
  const { port } = probe.address() as AddressInfo
  await new Promise<void>(resolve => probe.close(() => resolve()))
  return port
}

async function waitForJson(url: string, timeoutMs = 90_000): Promise<unknown> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown = new Error(`Timed out waiting for ${url}`)
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return await response.json()
      }
      lastError = new Error(`${url} responded with HTTP ${response.status}`)
    }
    catch (error) {
      lastError = error
    }
    await sleep(250)
  }
  throw lastError
}

describe('@teages/nitro-drizzle end-to-end build', () => {
  it('leaves the database untouched during build and serves queries after a deploy-time migration', { timeout: 300_000 }, async () => {
    // Given the base fixture app, copied inside the repository so its imports
    // resolve against the workspace install, built for a libSQL database
    const rootDir = await mkdtemp(join(repoRoot, '.test-drizzle-e2e-'))
    temporaryDirectories.push(rootDir)
    await copyFixture(rootDir, { moduleSpecifier: resolve(repoRoot, 'src/index') })
    const databaseFile = join(rootDir, 'app.db')
    // The fixture config enables devMock; a production build resolves no dev
    // database, so the inline drizzle block only retargets the driver and
    // connection at the throwaway database.
    const nitro = await createNitro({
      rootDir,
      drizzle: {
        dialect: 'sqlite',
        driver: 'libsql',
        schemaPath: './server/db/schema.sqlite.ts',
        migrationsDir: './server/db/migrations/sqlite',
        connection: { url: `file:${databaseFile}` },
      },
    })
    await build(nitro)
    await nitro.close()

    // Then the build leaves the database untouched
    const verify = createClient({ url: `file:${databaseFile}` })
    try {
      const tables = await verify.execute(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'counts'`,
      )
      expect(tables.rows).toHaveLength(0)
    }
    finally {
      verify.close()
    }

    // And applying the fixture's migration chain prepares the database for
    // the built server — the deploy-time `drizzle-kit migrate` stand-in
    const migrate = createClient({ url: `file:${databaseFile}` })
    try {
      for (const name of await fixtureMigrationNames('sqlite')) {
        const migrationSql = await readFile(
          join(fixtureMigrationsFolder('sqlite'), name, 'migration.sql'),
          'utf8',
        )
        await migrate.execute(migrationSql)
      }
    }
    finally {
      migrate.close()
    }

    // And the built server serves queries routed through the virtual #drizzle client
    const port = await reservePort()
    const serverProcess = spawn('node', [join(rootDir, '.output/server/index.mjs')], {
      cwd: rootDir,
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    childProcesses.push(serverProcess)
    serverProcess.stderr.on('data', chunk => console.error(String(chunk)))

    const countUrl = `http://127.0.0.1:${port}/api/count`
    await expect(waitForJson(countUrl)).resolves.toEqual({ count: 0 })
    const insert = await fetch(countUrl, { method: 'POST' })
    expect(insert.ok).toBe(true)
    await expect(waitForJson(countUrl)).resolves.toEqual({ count: 1 })
  })
})
