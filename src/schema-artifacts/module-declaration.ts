import type { DrizzleDriver, DrizzleLocalDriver } from '../types'
import { resolveDriverAdapterPath } from '../database/registry'

export function createModulesDeclaration(
  driver: DrizzleDriver,
  mockEngine?: DrizzleLocalDriver,
): string {
  const driverModule = JSON.stringify(resolveDriverAdapterPath(driver))
  const mockSection = mockEngine === undefined
    ? ''
    : `
  export type MockDatabase = ReturnType<
    typeof import(${JSON.stringify(resolveDriverAdapterPath(mockEngine))}).drizzle<
      NitroDrizzleGeneratedSchema['relations']
    >
  >
`

  return `type NitroDrizzleGeneratedSchema = typeof import('./schema.d.ts')

declare module '#drizzle' {
  export type DrizzleDatabase = ReturnType<
    typeof import(${driverModule}).drizzle<
      NitroDrizzleGeneratedSchema['relations']
    >
  >
${mockSection}
  export type DrizzleContext = {
    readonly db: DrizzleDatabase
    readonly schema: NitroDrizzleGeneratedSchema['schema']
    readonly relations: NitroDrizzleGeneratedSchema['relations']
    readonly mockDb: ${mockSection === '' ? 'undefined' : 'MockDatabase | undefined'}
  }

  export function useDrizzle(): DrizzleContext

  export const schema: NitroDrizzleGeneratedSchema['schema']
  export const relations: NitroDrizzleGeneratedSchema['relations']
}
`
}
