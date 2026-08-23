import type { ResolvedDrizzleConfig } from '../config/types'
import { access } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { argv, cwd } from 'node:process'

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  }
  catch {
    return false
  }
}

function outputServerDirectory(): string {
  const entry = argv[1]
  return entry === undefined ? cwd() : dirname(resolve(entry))
}

export async function resolveRuntimeMigrationsFolder(
  config: ResolvedDrizzleConfig,
): Promise<string> {
  const configuredMigrations = config.migrationsDir
  return configuredMigrations !== undefined && await exists(configuredMigrations)
    ? configuredMigrations
    : join(outputServerDirectory(), 'db/migrations')
}
