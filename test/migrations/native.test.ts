import type { DrizzleClient } from '../../src/drivers/create'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertV1MigrationFolder,
  MigrationLayoutError,
  NativeMigrationStateError,
  nativeMigratorExitCode,
  resolveNativeMigrator,
  runNativeMigrations,
} from '../../src/migrations/native'

describe('resolveNativeMigrator', () => {
  it.each([
    ['better-sqlite3', 'drizzle-orm/better-sqlite3/migrator', 'standard'],
    ['libsql', 'drizzle-orm/libsql/migrator', 'standard'],
    ['bun-sqlite', 'drizzle-orm/bun-sqlite/migrator', 'standard'],
    ['node-sqlite', 'drizzle-orm/node-sqlite/migrator', 'standard'],
    ['d1', 'drizzle-orm/d1/migrator', 'standard'],
    ['d1-http', 'drizzle-orm/sqlite-proxy/migrator', 'proxy'],
    ['postgres-js', 'drizzle-orm/postgres-js/migrator', 'standard'],
    ['pglite', 'drizzle-orm/pglite/migrator', 'standard'],
    ['neon-http', 'drizzle-orm/neon-http/migrator', 'standard'],
    ['mysql2', 'drizzle-orm/mysql2/migrator', 'standard'],
  ] as const)('maps %s to its native migrator', (driver, modulePath, invocation) => {
    // Given
    const expected = { modulePath, invocation }

    // When
    const resolved = resolveNativeMigrator(driver)

    // Then
    expect(resolved).toEqual(expected)
  })
})

describe('assertV1MigrationFolder', () => {
  it('rejects the legacy journal layout with an actionable error', async () => {
    // Given
    const folder = await mkdtemp(join(tmpdir(), 'nitro-drizzle-v0-'))
    await mkdir(join(folder, 'meta'), { recursive: true })
    await writeFile(join(folder, 'meta/_journal.json'), '{}')

    // When
    const result = assertV1MigrationFolder(folder)

    // Then
    await expect(result).rejects.toMatchObject({
      name: MigrationLayoutError.name,
      code: 'legacy_journal',
      migrationsFolder: folder,
    })
    await expect(result).rejects.toThrow('drizzle-kit up')
  })

  it('accepts recursive Drizzle v1 migration folders', async () => {
    // Given
    const folder = await mkdtemp(join(tmpdir(), 'nitro-drizzle-v1-'))
    const migrationFolder = join(folder, '20260818113400_create_users')
    await mkdir(migrationFolder, { recursive: true })
    await writeFile(join(migrationFolder, 'migration.sql'), 'SELECT 1;')
    await writeFile(join(migrationFolder, 'snapshot.json'), '{}')

    // When
    const result = await assertV1MigrationFolder(folder)

    // Then
    expect(result).toEqual({
      migrationsFolder: folder,
      migrationNames: ['20260818113400_create_users'],
    })
  })
})

describe('nativeMigratorExitCode', () => {
  it('reads a string exitCode from a migrator outcome', () => {
    // Given
    const outcome = { exitCode: 'pending' }

    // When
    const exitCode = nativeMigratorExitCode(outcome)

    // Then
    expect(exitCode).toBe('pending')
    if (exitCode === undefined) {
      throw new Error('Expected a native migrator exit code.')
    }
    expect(new NativeMigrationStateError('/tmp/migrations', exitCode)).toMatchObject({
      name: NativeMigrationStateError.name,
      code: 'migration_state_conflict',
      migrationsFolder: '/tmp/migrations',
      exitCode: 'pending',
    })
  })

  it('ignores outcomes without a string exitCode', () => {
    // Given
    const outcomes: readonly unknown[] = [undefined, {}, { exitCode: 1 }, 'ok']

    // When
    const exitCodes = outcomes.map(outcome => nativeMigratorExitCode(outcome))

    // Then
    expect(exitCodes).toEqual([undefined, undefined, undefined, undefined])
  })
})

describe('runNativeMigrations', () => {
  it('returns a typed unsupported result when a proxy callback is unavailable', async () => {
    // Given
    const folder = await mkdtemp(join(tmpdir(), 'nitro-drizzle-proxy-'))
    const client: DrizzleClient = {
      driver: 'd1-http',
      db: {},
      async execute() {},
      async close() {},
    }

    // When
    const result = await runNativeMigrations(client, folder)

    // Then
    expect(result).toMatchObject({
      ok: false,
      error: {
        name: 'NativeMigrationUnsupportedError',
        code: 'unsupported_native_migrator',
        driver: 'd1-http',
      },
    })
  })
})
