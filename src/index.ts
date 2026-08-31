import type { NitroModule } from 'nitro/types'
import type { DrizzleOptions } from './types'
import _default from './nitro-module/module'

// ABI facade: this file's source path determines the public dist/index.mjs
// export. The NitroOptions augmentation stays declared inline here — bundlers
// drop side-effect-only type imports when generating the shipped
// declarations, which would strip it from dist.
declare module 'nitro/types' {
  interface NitroOptions {
    drizzle?: DrizzleOptions
  }
}

export default _default as NitroModule
export type * from './types'
