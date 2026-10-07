export {}

declare global {
  interface ImportMeta {
    /**
     * Per-session studio auth key, injected as a JSON string literal via
     * `nitro.options.replace`. Absent in builds without the studio route,
     * where the handler answers 404.
     */
    readonly DRIZZLE_STUDIO_KEY?: string
    /**
     * Per-session key shared with the `devtool` Vite plugin, injected as a
     * JSON string literal via `nitro.options.replace`. Present only when the
     * plugin ran in this process; the keyed GET redirect answers like any
     * other request otherwise.
     */
    readonly DRIZZLE_DEVTOOLS_KEY?: string
  }
}
