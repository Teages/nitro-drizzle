import type { NuxtModule } from '@nuxt/schema'
import type { DrizzleOptions } from './types'
import _default from './nuxt-module/module'

export type ModuleOptions = DrizzleOptions

export default _default as NuxtModule<ModuleOptions, ModuleOptions, false>
