import type { DrizzleDriver } from '../types'

const ADAPTER_PATHS: Readonly<Record<DrizzleDriver, string>> = {
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

export function resolveDriverAdapterPath(driver: DrizzleDriver): string {
  return ADAPTER_PATHS[driver]
}
