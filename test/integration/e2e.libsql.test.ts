import type { AddressInfo } from 'node:net'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { createClient } from '@libsql/client'
import { build, createNitro } from 'nitro/builder'
import { afterEach, describe, expect, it } from 'vitest'
import NitroDrizzle from '../../src'

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
    // Given a minimal Nitro app with a schema, a v1 migration folder, and an API route
    const rootDir = await mkdtemp(join(process.cwd(), '.test-drizzle-e2e-'))
    temporaryDirectories.push(rootDir)
    const databaseFile = join(rootDir, 'app.db')
    await mkdir(join(rootDir, 'server/db/migrations/20260819000000_create_users'), { recursive: true })
    await mkdir(join(rootDir, 'server/api'), { recursive: true })
    await writeFile(
      join(rootDir, 'server/db/schema.ts'),
      `import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
})
`,
    )
    await writeFile(
      join(rootDir, 'server/db/migrations/20260819000000_create_users/migration.sql'),
      `CREATE TABLE users (
  id integer PRIMARY KEY AUTOINCREMENT,
  name text NOT NULL
);`,
    )
    await writeFile(
      join(rootDir, 'server/api/users.get.ts'),
      `import { useDrizzle } from '#drizzle'
import { defineHandler } from 'nitro'

export default defineHandler(async () => {
  const { db, schema } = useDrizzle()
  await db.insert(schema.users).values({ name: 'e2e' })
  return db.select().from(schema.users)
})
`,
    )

    // When the app is built without any build-time migration behavior
    const nitro = await createNitro({
      rootDir,
      serverDir: './server',
      buildDir: './node_modules/.nitro',
      modules: [NitroDrizzle],
      drizzle: {
        dialect: 'sqlite',
        driver: 'libsql',
        schemaPath: './server/db/schema.ts',
        connection: { url: `file:${databaseFile}` },
      },
    })
    await build(nitro)
    await nitro.close()

    // Then the build leaves the database untouched
    const verify = createClient({ url: `file:${databaseFile}` })
    try {
      const tables = await verify.execute(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'`,
      )
      expect(tables.rows).toHaveLength(0)
    }
    finally {
      verify.close()
    }

    // And applying the migration chain prepares the database for the built server
    const migrationSql = await readFile(
      join(rootDir, 'server/db/migrations/20260819000000_create_users/migration.sql'),
      'utf8',
    )
    const migrate = createClient({ url: `file:${databaseFile}` })
    try {
      await migrate.execute(migrationSql)
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

    await expect(
      waitForJson(`http://127.0.0.1:${port}/api/users`),
    ).resolves.toEqual([{ id: 1, name: 'e2e' }])
  })
})
