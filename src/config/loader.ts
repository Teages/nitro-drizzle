// ABI facade: obuild mirrors source paths into dist, so this file's location
// determines the public `./config` export target. The implementation lives in
// the configuration domain.
export { DrizzleConfigError, loadDrizzleConfig } from '../configuration/drizzle-kit'
export type { LoadDrizzleConfigOptions } from '../configuration/drizzle-kit'
