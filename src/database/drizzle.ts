import type { SQLWrapper } from 'drizzle-orm'
import type { DrizzleOptions } from '../contracts/public'
import { sql } from 'drizzle-orm'
import { resolveDriverAdapterPath } from './registry'

type QueryMethod = (query: SQLWrapper | string) => unknown

export interface OpaqueDrizzleDatabase {
  readonly run?: QueryMethod
  readonly execute?: QueryMethod
  readonly $client?: {
    readonly end?: () => unknown
    readonly close?: () => unknown
    readonly destroy?: () => unknown
  }
}

type DrizzleFactory = (...parameters: readonly unknown[]) => OpaqueDrizzleDatabase

export async function loadDrizzle(
  driver: Exclude<DrizzleOptions['driver'], 'd1'>,
): Promise<DrizzleFactory> {
  const modulePath = resolveDriverAdapterPath(driver)
  const { drizzle } = await import(/* @vite-ignore */ modulePath)
  return drizzle
}

export function invokeDrizzle(
  drizzle: DrizzleFactory,
  parameters: readonly unknown[],
): OpaqueDrizzleDatabase {
  return drizzle(...parameters)
}

export function createExecutor(
  database: OpaqueDrizzleDatabase,
  dialect: DrizzleOptions['dialect'],
): (query: string) => Promise<void> {
  const method = dialect === 'sqlite' ? database.run : database.execute
  if (method === undefined) {
    throw new TypeError(
      `Drizzle database does not expose ${dialect === 'sqlite' ? 'run' : 'execute'}().`,
    )
  }
  return async (query): Promise<void> => {
    await method.call(database, sql.raw(query))
  }
}

export function createCloser(
  database: OpaqueDrizzleDatabase,
): () => Promise<void> {
  return async (): Promise<void> => {
    const client = database.$client
    const close = client?.end ?? client?.close ?? client?.destroy
    await close?.call(client)
  }
}

type AssertAssignable<T extends U, U> = T
type _LibsqlDatabase = AssertAssignable<
  import('drizzle-orm/libsql').LibSQLDatabase,
  OpaqueDrizzleDatabase
>
type _PostgresDatabase = AssertAssignable<
  import('drizzle-orm/postgres-js').PostgresJsDatabase,
  OpaqueDrizzleDatabase
>
