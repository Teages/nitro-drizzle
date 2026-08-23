import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  createDrizzleClient: vi.fn(),
  runNativeMigrations: vi.fn(),
}))

vi.mock('../../src/drivers/create', () => ({
  createDrizzleClient: mocks.createDrizzleClient,
}))

vi.mock('../../src/migrations/native', () => ({
  runNativeMigrations: mocks.runNativeMigrations,
}))

const { createAndApplyDrizzleMigrations } = await import('../../src/migrations/apply')

describe('createAndApplyDrizzleMigrations', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.createDrizzleClient.mockResolvedValue({ close: mocks.close })
  })

  it('preserves both the migration and cleanup errors', async () => {
    // Given
    const migrationError = new Error('migration failed')
    const closeError = new Error('close failed')
    mocks.runNativeMigrations.mockRejectedValue(migrationError)
    mocks.close.mockRejectedValue(closeError)

    // When
    const migration = createAndApplyDrizzleMigrations({
      config: { dialect: 'sqlite', driver: 'libsql' },
      migrationsFolder: '/tmp/migrations',
    })

    // Then
    await expect(migration).rejects.toMatchObject({
      name: 'AggregateError',
      cause: migrationError,
      errors: [migrationError, closeError],
    })
  })
})
