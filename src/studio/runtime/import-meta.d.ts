export {}

declare global {
  interface ImportMeta {
    /**
     * Per-session studio auth key, injected as a JSON string literal via
     * `nitro.options.replace`. Absent in builds without the studio route,
     * where the handler answers 404.
     */
    readonly DRIZZLE_STUDIO_KEY?: string
  }
}
