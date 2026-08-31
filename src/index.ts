import type { NitroModule } from 'nitro/types'
import type { DrizzleOptions } from './types'
import _default from './nitro-module/module'

// ABI facade (its path determines the dist/index.mjs export); the augmentation
// stays inline because bundlers strip side-effect-only type imports from d.ts.
declare module 'nitro/types' {
  interface NitroOptions {
    drizzle?: DrizzleOptions
  }
}

export default _default as NitroModule
export type * from './types'
