import type { DrizzleBuildClientConfig } from '../drivers/contracts'
import type { NativeMigrationResult } from './native'
import { createDrizzleClient } from '../drivers/create'
import { runNativeMigrations } from './native'

export interface CreateAndApplyDrizzleMigrationsOptions {
  readonly config: DrizzleBuildClientConfig
  readonly migrationsFolder: string
}

export async function createAndApplyDrizzleMigrations(
  options: CreateAndApplyDrizzleMigrationsOptions,
): Promise<NativeMigrationResult> {
  const client = await createDrizzleClient(options.config)
  let result: NativeMigrationResult
  try {
    result = await runNativeMigrations(client, options.migrationsFolder)
  }
  catch (migrationError) {
    try {
      await client.close()
    }
    catch (closeError) {
      throw new AggregateError(
        [migrationError, closeError],
        'Database migration and client cleanup both failed.',
        { cause: migrationError },
      )
    }
    throw migrationError
  }
  await client.close()
  return result
}
