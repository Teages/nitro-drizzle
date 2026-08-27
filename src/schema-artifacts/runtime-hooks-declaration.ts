import { DEV_DATABASE_SEED_HOOK } from '../dev-database/contracts'

/**
 * Runtime hooks this package calls. They are declared to consumers as a
 * generated file because server code that hooks them never imports this
 * package — the declaration rides along with the other generated
 * `.nitro/drizzle` types already included by consumer tsconfigs. Keep the
 * signature in sync with `src/contracts/runtime/augmentations.d.ts`.
 */
export function createRuntimeHooksDeclaration(): string {
  return `declare module 'nitro/types' {
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
