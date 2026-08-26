/**
 * Types the `bun:test` imports used by `*.bun.test.ts` suites. The API shape
 * mirrors vitest's, so the test code stays identical whether it is authored
 * against `bun:test` at runtime (Bun's runner) or these declarations at
 * type-check time; installing the full `@types/bun` package just for three
 * symbols is not worth its node-type takeover.
 */
declare module 'bun:test' {
  export type { TestCase, TestFn } from 'vitest'
  export const describe: typeof import('vitest')['describe']
  export const it: typeof import('vitest')['it']
  export const expect: typeof import('vitest')['expect']
}
