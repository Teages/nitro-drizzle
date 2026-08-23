import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { relative } from 'pathe'
import { describe, expect, it } from 'vitest'
import {
  AssetSymlinkError,
  collectMigrationAssets,
} from '../../src/migrations/assets'

async function writeAsset(root: string, relativePath: string, content: string): Promise<void> {
  const path = join(root, relativePath)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, content)
}

describe('collectMigrationAssets', () => {
  it('copies complete v1 migration folders recursively', async () => {
    // Given
    const root = await mkdtemp(join(tmpdir(), 'nitro-drizzle-collect-'))
    const source = join(root, 'source')
    const destination = join(root, 'destination')
    await writeAsset(source, '20260818113400_create_users/migration.sql', 'SELECT 1;')
    await writeAsset(source, '20260818113400_create_users/snapshot.json', '{"source":"one"}')
    await writeAsset(source, '20260818113500_create_posts/migration.sql', 'SELECT 3;')

    // When
    const copied = await collectMigrationAssets({
      sourceDir: source,
      destinationDir: destination,
    })

    // Then
    expect(copied).toEqual([
      '20260818113400_create_users/migration.sql',
      '20260818113400_create_users/snapshot.json',
      '20260818113500_create_posts/migration.sql',
    ])
    await expect(readFile(join(destination, '20260818113400_create_users/migration.sql'), 'utf8'))
      .resolves
      .toBe('SELECT 1;')
  })

  it('treats an absent migration directory as empty', async () => {
    // Given
    const root = await mkdtemp(join(tmpdir(), 'nitro-drizzle-missing-source-'))
    const destination = join(root, 'destination')

    // When
    const copied = await collectMigrationAssets({
      sourceDir: join(root, 'not-created'),
      destinationDir: destination,
    })

    // Then
    expect(copied).toEqual([])
  })

  it('rejects a symbolic-link migration root', async () => {
    // Given
    const root = await mkdtemp(join(tmpdir(), 'nitro-drizzle-symlink-'))
    const source = join(root, 'source')
    const linkedSource = join(root, 'linked-source')
    await writeAsset(source, '20260818113400_init/migration.sql', 'SELECT 1;')
    await symlink(source, linkedSource)

    // When
    const copy = collectMigrationAssets({
      sourceDir: linkedSource,
      destinationDir: join(root, 'destination'),
    })

    // Then
    await expect(copy).rejects.toBeInstanceOf(AssetSymlinkError)
  })

  it.each(['file', 'directory'] as const)(
    'rejects a nested symbolic-link %s',
    async (kind) => {
      // Given
      const root = await mkdtemp(join(tmpdir(), 'nitro-drizzle-nested-symlink-'))
      const source = join(root, 'source')
      const outside = join(root, 'outside')
      const migration = join(source, '20260818113400_init')
      await mkdir(migration, { recursive: true })
      if (kind === 'file') {
        await writeFile(outside, 'SELECT 1;')
        await symlink(outside, join(migration, 'migration.sql'))
      }
      else {
        await writeAsset(outside, 'migration.sql', 'SELECT 1;')
        await symlink(outside, join(migration, 'linked'))
      }

      // When
      const copy = collectMigrationAssets({
        sourceDir: source,
        destinationDir: join(root, 'destination'),
      })

      // Then
      await expect(copy).rejects.toBeInstanceOf(AssetSymlinkError)
    },
  )

  it('rejects a destination reached through a symbolic link', async () => {
    // Given
    const root = await mkdtemp(join(tmpdir(), 'nitro-drizzle-destination-'))
    const source = join(root, 'source')
    const outside = join(root, 'outside')
    const linkedParent = join(root, 'linked-parent')
    await writeAsset(source, '20260818113400_init/migration.sql', 'SELECT 1;')
    await mkdir(outside)
    await symlink(outside, linkedParent)

    // When
    const copy = collectMigrationAssets({
      sourceDir: source,
      destinationDir: join(linkedParent, 'destination'),
    })

    // Then
    await expect(copy).rejects.toBeInstanceOf(AssetSymlinkError)
  })

  it('rejects a destination whose existing ancestor escapes its trusted root', async () => {
    // Given
    const root = await mkdtemp(join(tmpdir(), 'nitro-drizzle-ancestor-'))
    const trusted = join(root, 'trusted')
    const outside = join(root, 'outside')
    const linkedParent = join(trusted, 'linked-parent')
    const existingChild = join(linkedParent, 'existing-child')
    const source = join(root, 'source')
    await Promise.all([mkdir(trusted), mkdir(outside)])
    await symlink(outside, linkedParent)
    await mkdir(existingChild)
    await writeAsset(source, '20260818113400_init/migration.sql', 'SELECT 1;')

    // When
    const copy = collectMigrationAssets({
      sourceDir: source,
      destinationDir: join(existingChild, 'destination'),
      trustedDestinationRoot: trusted,
    })

    // Then
    await expect(copy).rejects.toThrow('unsafe database asset destination')
  })

  it('keeps relative asset paths forward-slashed for Windows hosts', () => {
    // The collection filter matches the `/migration.sql` and `/snapshot.json`
    // suffixes, so every path it sees must use forward slashes. pathe is
    // host-independent: drive-letter and backslash inputs still produce
    // forward-slash relative paths, on Windows and in this macOS/Linux test
    // alike — node:path would return `0001_init\migration.sql` on Windows
    // and filter out the entire migration chain.
    expect(relative('C:/chain', 'C:\\chain\\0001_init\\migration.sql'))
      .toBe('0001_init/migration.sql')
    expect(relative('C:\\chain', 'C:/chain/0002_add_posts/snapshot.json'))
      .toBe('0002_add_posts/snapshot.json')
  })
})
