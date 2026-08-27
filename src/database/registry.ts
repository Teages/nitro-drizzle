import type { DrizzleClientDriver, DrizzleOptions } from '../contracts/public'

export interface NativeMigratorResolution {
  readonly modulePath: string
  readonly invocation: 'standard' | 'proxy'
}

const ADAPTER_PATHS: Readonly<Record<DrizzleClientDriver, string>> = {
  'better-sqlite3': 'drizzle-orm/better-sqlite3',
  'libsql': 'drizzle-orm/libsql',
  'bun-sqlite': 'drizzle-orm/bun-sqlite',
  'node-sqlite': 'drizzle-orm/node-sqlite',
  'd1': 'drizzle-orm/d1',
  'd1-http': 'drizzle-orm/sqlite-proxy',
  'postgres-js': 'drizzle-orm/postgres-js',
  'pglite': 'drizzle-orm/pglite',
  'neon-http': 'drizzle-orm/neon-http',
  'mysql2': 'drizzle-orm/mysql2',
}

const NATIVE_MIGRATORS: Readonly<Record<
  DrizzleOptions['driver'],
  NativeMigratorResolution
>> = {
  'better-sqlite3': {
    modulePath: 'drizzle-orm/better-sqlite3/migrator',
    invocation: 'standard',
  },
  'libsql': {
    modulePath: 'drizzle-orm/libsql/migrator',
    invocation: 'standard',
  },
  'bun-sqlite': {
    modulePath: 'drizzle-orm/bun-sqlite/migrator',
    invocation: 'standard',
  },
  'node-sqlite': {
    modulePath: 'drizzle-orm/node-sqlite/migrator',
    invocation: 'standard',
  },
  'd1': {
    modulePath: 'drizzle-orm/d1/migrator',
    invocation: 'standard',
  },
  'd1-http': {
    modulePath: 'drizzle-orm/sqlite-proxy/migrator',
    invocation: 'proxy',
  },
  'postgres-js': {
    modulePath: 'drizzle-orm/postgres-js/migrator',
    invocation: 'standard',
  },
  'pglite': {
    modulePath: 'drizzle-orm/pglite/migrator',
    invocation: 'standard',
  },
  'neon-http': {
    modulePath: 'drizzle-orm/neon-http/migrator',
    invocation: 'standard',
  },
  'mysql2': {
    modulePath: 'drizzle-orm/mysql2/migrator',
    invocation: 'standard',
  },
}

export function resolveDriverAdapterPath(driver: DrizzleClientDriver): string {
  return ADAPTER_PATHS[driver]
}

export function resolveDriverMigrator(
  driver: DrizzleOptions['driver'],
): NativeMigratorResolution {
  return NATIVE_MIGRATORS[driver]
}
