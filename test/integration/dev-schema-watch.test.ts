import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'
import { afterEach, describe, it } from 'vitest'

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

async function pollSchemaKeys(
  url: string,
  expected: readonly string[],
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastFailure = 'request never ran'
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        const keys = (await response.json()) as string[]
        const sorted = [...keys].sort()
        if (sorted.join() === [...expected].sort().join()) {
          return
        }
        lastFailure = `keys were ${JSON.stringify(sorted)}`
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
  throw new Error(
    `Dev server never served schema keys ${JSON.stringify(expected)}: ${lastFailure}`,
  )
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(path =>
      rm(path, { recursive: true, force: true }),
    ),
  )
})

/**
 * Runs a real `nitro dev` server against a throwaway app and verifies that
 * the explicit schema entry and its normal module graph hot-reload without a
 * nitro-drizzle-specific directory watcher.
 */
describe('explicit schema entry HMR', () => {
  it('follows schema dependencies added, renamed, and deleted through the entry', { timeout: 300_000 }, async () => {
    // Given a minimal rollup-builder Nitro app
    const rootDir = await mkdtemp(join(repoRoot, '.test-dev-watch-'))
    temporaryDirectories.push(rootDir)
    const schemaDir = join(rootDir, 'server/db/schema')
    await Promise.all([
      mkdir(join(rootDir, 'server/db'), { recursive: true }),
      mkdir(join(rootDir, 'server/api'), { recursive: true }),
    ])
    await writeFile(
      join(rootDir, 'server/db/schema.ts'),
      `import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
})
`,
    )
    await writeFile(
      join(rootDir, 'server/api/schema.get.ts'),
      `import { defineHandler } from 'nitro'
import { useDrizzle } from '#drizzle'

export default defineHandler(() => Object.keys(useDrizzle().schema))
`,
    )
    await writeFile(
      join(rootDir, 'nitro.config.ts'),
      `import { defineConfig } from 'nitro/config'
import NitroDrizzle from ${JSON.stringify(resolve(repoRoot, 'src/index'))}

export default defineConfig({
  serverDir: './server',
  modules: [NitroDrizzle],
  drizzle: {
    dialect: 'sqlite',
    driver: 'libsql',
    schemaPath: './server/db/schema.ts',
    connection: { url: ${JSON.stringify(`file:${join(rootDir, 'dev.db')}`)} },
  },
})
`,
    )
    // The default non-vite builder is rolldown, a nitro peer dependency the
    // throwaway project does not declare; link the repository's copy.
    await mkdir(join(rootDir, 'node_modules'), { recursive: true })
    await symlink(
      resolve(repoRoot, 'node_modules/.pnpm/rolldown@1.0.1/node_modules/rolldown'),
      join(rootDir, 'node_modules', 'rolldown'),
      'dir',
    )
    const port = await reservePort()

    // When the dev server boots with the dev database disabled
    const child = spawn(nitroBin, ['dev', '--port', String(port)], {
      cwd: rootDir,
      env: { ...process.env, NITRO_DRIZZLE_DEV: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    try {
      const url = `http://127.0.0.1:${port}/api/schema`

      // Then the initial schema set is served
      await pollSchemaKeys(url, ['users'], 90_000)

      // And a newly added schema dependency reaches the served schema once
      // the explicit entry exports it
      await mkdir(schemaDir, { recursive: true })
      await writeFile(
        join(schemaDir, 'posts.ts'),
        `import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const posts = sqliteTable('posts', {
  title: text('title').notNull(),
})
`,
      )
      await writeFile(
        join(rootDir, 'server/db/schema.ts'),
        `import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
})

export { posts } from './schema/posts'
`,
      )
      await pollSchemaKeys(url, ['posts', 'users'], 30_000)

      // And a rename is expressed through the same explicit entry
      await rename(join(schemaDir, 'posts.ts'), join(schemaDir, 'articles.ts'))
      await writeFile(
        join(schemaDir, 'articles.ts'),
        `import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const articles = sqliteTable('articles', {
  title: text('title').notNull(),
})
`,
      )
      await writeFile(
        join(rootDir, 'server/db/schema.ts'),
        `import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
})

export { articles } from './schema/articles'
`,
      )
      await pollSchemaKeys(url, ['users', 'articles'], 30_000)

      // And removing the export before deleting the dependency keeps the
      // module graph healthy
      await writeFile(
        join(rootDir, 'server/db/schema.ts'),
        `import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
})
`,
      )
      await unlink(join(schemaDir, 'articles.ts'))
      await pollSchemaKeys(url, ['users'], 30_000)
    }
    finally {
      const exited = new Promise<void>((resolvePromise) => {
        child.once('exit', () => resolvePromise())
      })
      child.kill('SIGTERM')
      await Promise.race([
        exited,
        new Promise<void>(resolvePromise => setTimeout(resolvePromise, 10_000)),
      ]).then(() => {
        if (child.exitCode === null) {
          child.kill('SIGKILL')
        }
      })
      await exited.catch(() => {})
    }
  })
})
