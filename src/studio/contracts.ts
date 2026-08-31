/**
 * Internal Nitro route the local proxy dispatches to. It is never part of
 * the public API surface and answers with 404 when the studio is disabled.
 */
export const STUDIO_ROUTE = '/_drizzle/studio'

/**
 * Compile-time replacement marker for the per-session studio auth key. The
 * module injects a JSON string literal via `nitro.options.replace`; without
 * the replacement (production builds) every access reads as `undefined` and
 * the route pretends not to exist. Assembled from parts on purpose: the
 * replacement is a raw text substitution and must not rewrite this
 * definition itself.
 */
export const STUDIO_AUTH_KEY_MARKER = ['import', 'meta', 'DRIZZLE_STUDIO_KEY'].join('.')

/**
 * Compile-time replacement marker for the per-session devtools key, minted by
 * the `devtool` Vite plugin and shared through a process global. Without the
 * plugin (and the replacement it triggers) every access reads as `undefined`
 * and the redirect stays closed. Assembled from parts for the same reason as
 * the studio marker above.
 */
export const DEVTOOLS_KEY_MARKER = ['import', 'meta', 'DRIZZLE_DEVTOOLS_KEY'].join('.')
