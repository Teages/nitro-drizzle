import type { DrizzleOptions } from './types'

// ABI facade: this file's source path determines the public dist/index.mjs
// export. The NitroOptions augmentation stays declared inline here — bundlers
// drop side-effect-only type imports when generating the shipped
// declarations, which would strip it from dist.
declare module 'nitro/types' {
  interface NitroOptions {
    drizzle?: DrizzleOptions
  }
}

export { default } from './nitro-module/module'
export type * from './types'
