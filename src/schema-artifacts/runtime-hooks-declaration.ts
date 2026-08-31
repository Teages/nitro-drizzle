import { DEV_DATABASE_SEED_HOOK } from '../dev-database/contracts'

/** The leading `export {}` is load-bearing: without it the `declare module` shadows nitro/types. */
export function createRuntimeHooksDeclaration(): string {
  return `export {}

declare module 'nitro/types' {
  interface NitroRuntimeHooks {
    /**
     * The dev database is ready: schema pushed, migrations applied. Seed
     * test data here; only fired when the dev database is enabled.
     */
    '${DEV_DATABASE_SEED_HOOK}': () => void | Promise<void>
  }
}
`
}
