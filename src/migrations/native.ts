import type { DrizzleClient } from '../drivers/create'
import type { NativeMigratorResolution } from '../drivers/registry'
import type { DrizzleOptions } from '../types'
import { access, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveDriverMigrator } from '../drivers/registry'

export type { NativeMigratorResolution } from '../drivers/registry'

type RuntimeCallable = (...arguments_: readonly unknown[]) => unknown

export interface V1MigrationFolder {
  readonly migrationsFolder: string
  readonly migrationNames: readonly string[]
}

export class MigrationLayoutError extends Error {
  readonly code = 'legacy_journal'

  constructor(readonly migrationsFolder: string) {
    super(
      `Legacy Drizzle migration journal found in ${migrationsFolder}. Upgrade drizzle-kit and run "drizzle-kit up" before using the Drizzle v1 native migrators.`,
    )
    this.name = 'MigrationLayoutError'
  }
}

export class NativeMigrationStateError extends Error {
  readonly code = 'migration_state_conflict'

  constructor(
    readonly migrationsFolder: string,
    readonly exitCode: string,
  ) {
    super(`Native Drizzle migrator stopped with ${exitCode} for ${migrationsFolder}.`)
    this.name = 'NativeMigrationStateError'
  }
}

export class NativeMigrationUnsupportedError extends Error {
  readonly code = 'unsupported_native_migrator'

  constructor(
    readonly driver: DrizzleOptions['driver'],
    message: string,
  ) {
    super(message)
    this.name = 'NativeMigrationUnsupportedError'
  }
}

export type NativeMigrationResult
  = | { readonly ok: true }
    | {
      readonly ok: false
      readonly error: NativeMigrationUnsupportedError
    }

function isMissingPath(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && error.code === 'ENOENT'
}

export function nativeMigratorExitCode(outcome: unknown): string | undefined {
  if (typeof outcome !== 'object' || outcome === null) {
    return undefined
  }
  if (!('exitCode' in outcome)) {
    return undefined
  }
  const { exitCode } = outcome
  return typeof exitCode === 'string' ? exitCode : undefined
}

export function resolveNativeMigrator(
  driver: DrizzleOptions['driver'],
): NativeMigratorResolution {
  return resolveDriverMigrator(driver)
}

export async function assertV1MigrationFolder(
  migrationsFolder: string,
): Promise<V1MigrationFolder> {
  try {
    await access(join(migrationsFolder, 'meta/_journal.json'))
    throw new MigrationLayoutError(migrationsFolder)
  }
  catch (error) {
    if (error instanceof MigrationLayoutError) {
      throw error
    }
    if (!isMissingPath(error)) {
      throw error
    }
  }

  const entries = await readdir(migrationsFolder, { withFileTypes: true })
  const migrationNames: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'meta') {
      continue
    }
    try {
      await access(join(migrationsFolder, entry.name, 'migration.sql'))
      migrationNames.push(entry.name)
    }
    catch (error) {
      if (!isMissingPath(error)) {
        throw error
      }
    }
  }
  migrationNames.sort((left, right) => left.localeCompare(right))
  return { migrationsFolder, migrationNames }
}

async function loadMigrator(
  resolution: NativeMigratorResolution,
): Promise<RuntimeCallable> {
  const { migrate } = await import(
    /* @vite-ignore */
    resolution.modulePath,
  )
  return migrate
}

export async function runNativeMigrations(
  client: DrizzleClient,
  migrationsFolder: string,
): Promise<NativeMigrationResult> {
  await assertV1MigrationFolder(migrationsFolder)
  const resolution = resolveNativeMigrator(client.driver)
  if (resolution.invocation === 'proxy' && client.proxyMigration === undefined) {
    return {
      ok: false,
      error: new NativeMigrationUnsupportedError(
        client.driver,
        'd1-http requires a transactional proxy migration callback; this client does not provide one.',
      ),
    }
  }

  const migrate = await loadMigrator(resolution)
  const config = { migrationsFolder }
  const result: unknown = resolution.invocation === 'proxy'
    ? Reflect.apply(migrate, undefined, [client.db, client.proxyMigration, config])
    : Reflect.apply(migrate, undefined, [client.db, config])
  const outcome: unknown = await Promise.resolve(result)
  const exitCode = nativeMigratorExitCode(outcome)
  if (exitCode !== undefined) {
    throw new NativeMigrationStateError(migrationsFolder, exitCode)
  }
  return { ok: true }
}
