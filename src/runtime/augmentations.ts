declare module 'nitro/types' {
  interface NitroRuntimeHooks {
    'drizzle:dev:seed': () => void | Promise<void>
  }
}
