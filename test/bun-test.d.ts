/**
 * Types the `bun:test` imports used by `*.bun.test.ts` suites. The API shape
 * mirrors vitest's, so the test code stays identical whether it is authored
 * against `bun:test` at runtime (Bun's runner) or these declarations at
 * type-check time. `@types/bun` is installed for the bun-sqlite type gates
 * but stays out of the global auto-include (`"types": ["node"]`), so these
 * declarations remain what resolves `bun:test` in the node project.
 */
declare module 'bun:test' {
  export type { TestCase, TestFn } from 'vitest'
  export const describe: typeof import('vitest')['describe']
  export const it: typeof import('vitest')['it']
  export const expect: typeof import('vitest')['expect']
}
