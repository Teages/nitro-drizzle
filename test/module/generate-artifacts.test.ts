import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createNitro } from 'nitro/builder'
import { afterEach, describe, expect, it } from 'vitest'
import { generateDrizzleArtifacts } from '../../src/codegen/generate'
import { resolveDrizzleConfig } from '../../src/config/resolve'

const temporaryDirectories: string[] = []

async function createTemporaryRoot(): Promise<string> {
  const rootDir = await mkdtemp(join(process.cwd(), '.test-drizzle-prepare-'))
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

describe('generateDrizzleArtifacts', () => {
  it('emits artifacts for the explicit schema entry', async () => {
    // Given
    const rootDir = await createTemporaryRoot()
    const serverDir = join(rootDir, 'server')
    await mkdir(join(serverDir, 'db'), { recursive: true })
    const rootSchemaPath = join(serverDir, 'db/schema.ts')
    await writeFile(rootSchemaPath, 'export const users = { table: "users" }\n')
    const nitro = await createNitro({
      rootDir,
      serverDir: './server',
      buildDir: './node_modules/.nitro',
    })
    expect(nitro.options.serverDir).not.toBe(false)
    if (nitro.options.serverDir === false) {
      await nitro.close()
      return
    }
    const config = resolveDrizzleConfig(
      {
        dialect: 'sqlite',
        driver: 'libsql',
        connection: { url: 'file:database.db' },
      },
      { serverDir: nitro.options.serverDir },
    )
    expect(config).toBeDefined()
    if (config === undefined) {
      await nitro.close()
      return
    }

    // When
    const artifacts = await generateDrizzleArtifacts({
      buildDir: nitro.options.buildDir,
      config,
      schemaPath: rootSchemaPath,
    })

    // Then
    expect(artifacts.directory).toBe(join(nitro.options.buildDir, 'drizzle'))
    expect(config.migrationsDir).toBe(
      join(serverDir, 'db/migrations/sqlite'),
    )
    expect(nitro.options.runtimeConfig.drizzle).toBeUndefined()
    await nitro.close()
  })
})
