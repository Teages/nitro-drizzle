import type { DrizzleClientDriver } from '../../contracts/public'
import { resolveDriverAdapterPath } from '../../database/registry'

export function createModulesDeclaration(driver: DrizzleClientDriver): string {
  const driverModule = JSON.stringify(resolveDriverAdapterPath(driver))

  return `type NitroDrizzleGeneratedSchema = typeof import('./schema.d.ts')

declare module '#drizzle' {
  export type DrizzleDatabase = ReturnType<
    typeof import(${driverModule}).drizzle<
      NitroDrizzleGeneratedSchema['relations']
    >
  >

  export type DrizzleContext = {
    readonly db: DrizzleDatabase
    readonly schema: NitroDrizzleGeneratedSchema['schema']
    readonly relations: NitroDrizzleGeneratedSchema['relations']
  }

  export function useDrizzle(): DrizzleContext

  export const schema: NitroDrizzleGeneratedSchema['schema']
  export const relations: NitroDrizzleGeneratedSchema['relations']
}
`
}
