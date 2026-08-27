import type { AddressInfo } from 'node:net'
import { execFile, spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const repoRoot = process.cwd()
const temporaryDirectories: string[] = []
const childProcesses: ReturnType<typeof spawn>[] = []

afterEach(async () => {
  for (const child of childProcesses.splice(0)) {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      await new Promise<void>(resolve => child.once('exit', () => resolve()))
    }
  }
  await Promise.all(
    temporaryDirectories.splice(0).map(path =>
      rm(path, { recursive: true, force: true }),
    ),
  )
})

async function reservePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}

async function waitForJson(url: string, output: () => string): Promise<unknown> {
  const deadline = Date.now() + 90_000
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
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`${String(lastError)}\n${output()}`)
}

async function stop(child: ReturnType<typeof spawn>): Promise<void> {
  const index = childProcesses.indexOf(child)
  if (index !== -1) {
    childProcesses.splice(index, 1)
  }
  if (child.exitCode !== null) {
    return
  }
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  child.kill('SIGTERM')
  await Promise.race([
    exited,
    new Promise<void>(resolve => setTimeout(resolve, 10_000)),
  ])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
  }
  await exited
}

async function startNitroDev(
  rootDir: string,
  port: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ child: ReturnType<typeof spawn>, output: () => string }> {
  const nitroBin = join(rootDir, 'node_modules/.bin/nitro')
  let logs = ''
  const child = spawn(
    nitroBin,
    ['dev', '--host', '127.0.0.1', '--port', String(port)],
    { cwd: rootDir, env, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  childProcesses.push(child)
  child.stdout?.on('data', chunk => logs += String(chunk))
  child.stderr?.on('data', chunk => logs += String(chunk))
  return { child, output: () => logs }
}

describe('published runtime entries in Nitro dev', () => {
  it('resolves app virtuals inside the installed package', { timeout: 600_000 }, async () => {
    // Given an isolated consumer installed from the actual package tarball
    const rootDir = await mkdtemp(join(tmpdir(), 'nitro-drizzle-runtime-tarball-'))
    temporaryDirectories.push(rootDir)
    await execFileAsync('pnpm', ['pack', '--pack-destination', rootDir], {
      cwd: repoRoot,
      env: process.env,
    })
    const tarball = (await readdir(rootDir)).find(name => name.endsWith('.tgz'))
    if (tarball === undefined) {
      throw new Error('pnpm pack did not create a tarball.')
    }
    const packageDir = join(rootDir, 'node_modules/@teages/nitro-drizzle')
    await mkdir(packageDir, { recursive: true })
    await execFileAsync(
      'tar',
      ['-xzf', join(rootDir, tarball), '-C', packageDir, '--strip-components=1'],
    )
    // Every obuild entry ships a file: obuild mirrors src/ paths into dist/,
    // so an entry pointing at a moved-away source silently drops its output.
    for (const entry of [
      'index',
      'config/loader',
      'configuration/runtime/connection',
      'dev-database/runtime/plugin',
      'studio/runtime/plugin',
      'studio/runtime/handler',
    ]) {
      await access(join(packageDir, 'dist', `${entry}.mjs`))
    }
    await writeFile(
      join(rootDir, 'package.json'),
      `${JSON.stringify({
        private: true,
        type: 'module',
      }, null, 2)}\n`,
    )
    for (const dependency of [
      'drizzle-kit',
      'drizzle-orm',
      'nitro',
      'pathe',
      'rolldown',
      'scule',
      'srvx',
    ]) {
      await symlink(
        join(repoRoot, 'node_modules', dependency),
        join(rootDir, 'node_modules', dependency),
        'dir',
      )
    }
    await mkdir(join(rootDir, 'node_modules/.bin'), { recursive: true })
    await symlink(
      join(repoRoot, 'node_modules/.bin/nitro'),
      join(rootDir, 'node_modules/.bin/nitro'),
      'file',
    )

    const serverDir = join(rootDir, 'server')
    const migrationDir = join(
      serverDir,
      'db/migrations/sqlite/20260824000000_create_todos',
    )
    await Promise.all([
      mkdir(join(serverDir, 'api'), { recursive: true }),
      mkdir(join(serverDir, 'plugins'), { recursive: true }),
      mkdir(migrationDir, { recursive: true }),
    ])
    await writeFile(
      join(serverDir, 'db/schema.ts'),
      `import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const todos = sqliteTable('todos', {
  id: integer('id').primaryKey(),
  title: text('title').notNull(),
})
`,
    )
    await writeFile(
      join(migrationDir, 'migration.sql'),
      'CREATE TABLE todos (id integer PRIMARY KEY, title text NOT NULL);\n',
    )
    await writeFile(
      join(serverDir, 'plugins/seed.ts'),
      `import { definePlugin } from 'nitro'
import { useDrizzle } from '#drizzle'

export default definePlugin((nitro) => {
  nitro.hooks.hook('drizzle:dev-mock:seed', async () => {
    const { db, schema } = useDrizzle()
    await db.insert(schema.todos)
      .values({ id: 1, title: 'seeded' })
      .onConflictDoNothing()
  })
})
`,
    )
    await writeFile(
      join(serverDir, 'api/todos.get.ts'),
      `import { defineHandler } from 'nitro'
import { useDrizzle } from '#drizzle'

export default defineHandler(async () => {
  const { db, schema } = useDrizzle()
  return db.select().from(schema.todos)
})
`,
    )
    await writeFile(
      join(serverDir, 'api/health.get.ts'),
      `import { defineHandler } from 'nitro'

export default defineHandler(() => ({ ok: true }))
`,
    )
    const devDatabase = join(rootDir, 'dev.db')
    const realDatabase = join(rootDir, 'real.db')
    await writeFile(
      join(rootDir, 'nitro.config.ts'),
      `import { defineConfig } from 'nitro/config'
import NitroDrizzle from '@teages/nitro-drizzle'

export default defineConfig({
  serverDir: './server',
  modules: [NitroDrizzle],
  drizzle: {
    dialect: 'sqlite',
    driver: 'node-sqlite',
    schemaPath: './server/db/schema.ts',
    devMock: { driver: 'node-sqlite', file: ${JSON.stringify(devDatabase)} },
    connection: { url: ${JSON.stringify(realDatabase)} },
  },
})
`,
    )

    // When Nitro dev starts from the installed package
    const devPort = await reservePort()
    const dev = await startNitroDev(rootDir, devPort)
    await expect(
      waitForJson(`http://127.0.0.1:${devPort}/api/todos`, dev.output),
    ).resolves.toEqual([{ id: 1, title: 'seeded' }])

    // Then #drizzle resolves inside the consumer graph
    const devBundle = await readFile(
      join(rootDir, 'node_modules/.nitro/dev/index.mjs'),
      'utf8',
    )
    expect(devBundle).not.toMatch(/from\s+["']#drizzle["']/)
    await stop(dev.child)
  })
})
