import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveDrizzleConfig } from '../../src/configuration/resolve'
import { generateDrizzleArtifacts } from '../../src/schema-artifacts/generate'
import { packRepository } from './pack'

const execFileAsync = promisify(execFile)
const repoRoot = process.cwd()
const temporaryDirectories: string[] = []

// The consumer root must live outside this repository: inside it, TypeScript
// self-resolves `@teages/nitro-drizzle` through the repo's own package.json
// and silently reads `dist/` instead of the extracted tarball.
async function createTemporaryRoot(): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), 'nitro-drizzle-consumer-'))
  temporaryDirectories.push(rootDir)
  return rootDir
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(path =>
      rm(path, { recursive: true, force: true }),
    ),
  )
})

/**
 * Compiles a consumer project against the real published artifact: `pnpm`
 * pack runs the prepack build, the tarball is installed the way npm would
 * lay it out, and every type resolves through the package exports map. This
 * is the gate for declaration losses — bundling issues like dropped module
 * augmentations only show up here, never against source.
 */
describe('published package consumer types', () => {
  it('typechecks Nitro augmentations from the real tarball', async () => {
    // Given: a packed tarball laid out like an installed dependency
    const rootDir = await createTemporaryRoot()
    const tarballPath = await packRepository(rootDir)
    const packageDir = join(rootDir, 'node_modules', '@teages', 'nitro-drizzle')
    await mkdir(packageDir, { recursive: true })
    await execFileAsync('tar', ['-xzf', tarballPath, '-C', packageDir, '--strip-components=1'])
    const shipped = await readdir(packageDir)
    expect(shipped).toContain('dist')

    // Peer dependencies resolve through symlinks to the repository install.
    for (const peer of ['nitro', 'drizzle-orm']) {
      await symlink(
        resolve(repoRoot, 'node_modules', peer),
        join(rootDir, 'node_modules', peer),
        'dir',
      )
    }

    // And: generated declarations for the consumer project
    const serverDir = join(rootDir, 'server', 'db')
    await mkdir(serverDir, { recursive: true })
    const schemaPath = join(serverDir, 'schema.ts')
    await writeFile(
      schemaPath,
      `import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
})
`,
    )
    const config = resolveDrizzleConfig(
      {
        dialect: 'sqlite',
        driver: 'libsql',
        connection: { url: 'file:database.db' },
      },
      { serverDir: join(rootDir, 'server') },
    )
    expect(config).toBeDefined()
    if (config === undefined) {
      return
    }
    const artifacts = await generateDrizzleArtifacts({
      directory: join(rootDir, 'node_modules/.nitro-drizzle'),
      config,
      schemaPath,
    })

    // And: consumer sources using every public type surface.
    const configFile = join(rootDir, 'nitro.config.ts')
    const pluginFile = join(rootDir, 'server', 'plugin.ts')
    const tsconfigFile = join(rootDir, 'tsconfig.json')
    await Promise.all([
      writeFile(
        configFile,
        `import { defineConfig } from 'nitro'
import NitroDrizzle from '@teages/nitro-drizzle'

export default defineConfig({
  modules: [NitroDrizzle],
  drizzle: {
    dialect: 'sqlite',
    driver: 'libsql',
    schemaPath: './server/db/schema.ts',
    connection: { url: 'file:.data/database.db' },
  },
})
`,
      ),
      writeFile(
        pluginFile,
        `import { useNitroHooks } from 'nitro/app'
import { useDrizzle } from '#drizzle'

useNitroHooks().hook('drizzle:dev-mock:seed', async () => {
  const { db } = useDrizzle()
  void db
})
`,
      ),
      writeFile(
        tsconfigFile,
        JSON.stringify({
          compilerOptions: {
            module: 'ESNext',
            moduleResolution: 'Bundler',
            noEmit: true,
            skipLibCheck: true,
            strict: true,
          },
          // The README-documented include for the generated declarations —
          // `node_modules/.nitro-drizzle/**/*.d.ts`. Every emitted artifact
          // must match this glob, so no `*.d.mts` companion is added here.
          include: [
            configFile,
            pluginFile,
            join(artifacts.directory, '**', '*.d.ts'),
          ],
        }),
      ),
    ])

    // Then: `drizzle` options, runtime config, and the seed hook only exist
    // when the shipped declarations still carry the augmentations.
    await expect(
      execFileAsync(join(repoRoot, 'node_modules/.bin/tsc'), [
        '--project',
        tsconfigFile,
      ]),
    ).resolves.toBeDefined()
  })
})
