import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { argv } from 'node:process'
import { describe, expect, it } from 'vitest'
import { resolveDrizzleConfig } from '../../src/config/resolve'
import { resolveRuntimeMigrationsFolder } from '../../src/migrations/runtime-paths'

describe('resolveRuntimeMigrationsFolder', () => {
  it('falls back to deployment-local packaged assets', async () => {
    // Given
    const config = resolveDrizzleConfig({
      dialect: 'sqlite',
      driver: 'libsql',
      migrationsDir: '/missing/drizzle/runtime-assets/migrations',
    }, { serverDir: false })
    expect(config).toBeDefined()
    if (config === undefined) {
      return
    }

    // When
    const folder = await resolveRuntimeMigrationsFolder(config)

    // Then
    const serverDirectory = dirname(resolve(argv[1] ?? '.'))
    expect(folder).toBe(join(serverDirectory, 'db/migrations'))
  })

  it('keeps available development assets', async () => {
    // Given
    const root = await mkdtemp(join(tmpdir(), 'nitro-drizzle-runtime-'))
    const migrationsFolder = join(root, 'migrations')
    await mkdir(migrationsFolder)
    const config = resolveDrizzleConfig({
      dialect: 'sqlite',
      driver: 'libsql',
      migrationsDir: migrationsFolder,
    }, { serverDir: false })
    expect(config).toBeDefined()
    if (config === undefined) {
      return
    }

    // When
    const folder = await resolveRuntimeMigrationsFolder(config)

    // Then
    expect(folder).toBe(migrationsFolder)
  })
})
