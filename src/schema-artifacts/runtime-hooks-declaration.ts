import { DEV_DATABASE_SEED_HOOK } from '../dev-database/contracts'

/**
 * Runtime hooks this package calls. They are declared to consumers as a
 * generated file because server code that hooks them never imports this
 * package — the declaration rides along with the other generated
 * `.nitro/drizzle` types already included by consumer tsconfigs.
 *
 * The leading `export {}` is load-bearing: it makes the file a module, so
 * `declare module 'nitro/types'` reads as a module augmentation. In a global
 * script the same block would be an ambient module declaration that shadows
 * the real nitro/types package and types every `definePlugin` callback
 * parameter as implicit any.
 */
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
