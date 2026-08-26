export interface SourceImports {
  readonly adapter: string
  readonly schema: string
  readonly relations: string
  readonly extras?: readonly string[]
}

/**
 * Dev-database mode: the connection is known at build time and baked into the
 * generated source instead of being read from runtime config.
 */
export interface DevClientConnection {
  readonly connection?: string
}

export const USE_CONNECTION_IMPORT
  = `import { useDrizzleConnection } from '#drizzle/config'`

export const USE_REQUEST_IMPORT = `import { useRequest } from 'nitro/context'`

export interface ConnectionSourceVariants {
  /** Dev-database mode: bake the resolved connection into the source. */
  readonly dev: (imports: SourceImports, dev: DevClientConnection) => string
  /** Production mode: resolve the connection from runtime config on first use. */
  readonly runtime: (imports: SourceImports) => string
}

/**
 * Sole owner of the dev-baked vs runtime-resolved connection decision, so
 * local-engine templates only describe the two source shapes.
 */
export function connectionAwareSource(
  imports: SourceImports,
  dev: DevClientConnection | undefined,
  variants: ConnectionSourceVariants,
): string {
  if (dev === undefined) {
    return variants.runtime({ ...imports, extras: [USE_CONNECTION_IMPORT] })
  }
  return variants.dev(imports, dev)
}

export function quote(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll('\'', '\\\'')}'`
}

export function sourceHeader(imports: SourceImports): string {
  const generatedImports = imports.schema === imports.relations
    ? [`import { relations, schema } from ${quote(imports.schema)}`]
    : [
        `import { schema } from ${quote(imports.schema)}`,
        `import { relations } from ${quote(imports.relations)}`,
      ]
  return [
    `import { drizzle } from ${quote(imports.adapter)}`,
    ...(imports.extras ?? []),
    ...generatedImports,
  ].join('\n')
}

/**
 * Process-level lazy singleton: `initDrizzle` runs on the first
 * `useDrizzle()` call so credentials resolve from runtime config and
 * environment variables at request time, not at module evaluation.
 */
export function lazyUseDrizzleSource(
  imports: SourceImports,
  initBody: string,
): string {
  return `${sourceHeader(imports)}

let _db = null

function initDrizzle() {
${initBody}
}

export function useDrizzle() {
  _db ??= initDrizzle()
  return { db: _db, schema, relations }
}
`
}

/**
 * Request-binding templates resolve the database from a Cloudflare binding on
 * every call via Nitro's request context and cache it on the request.
 */
export function requestBindingHelpers(): string {
  return `class NitroDrizzleBindingError extends Error {
  constructor(binding) {
    super(\`Nitro Drizzle requires the \${binding} Cloudflare binding in request context.\`)
    this.name = 'NitroDrizzleBindingError'
  }
}

function useRequestContext(name) {
  let request
  try {
    request = useRequest()
  }
  catch {
    throw new NitroDrizzleBindingError(name)
  }
  if (!request?.context) throw new NitroDrizzleBindingError(name)
  return request
}

function requireBinding(binding, name) {
  if (!binding) throw new NitroDrizzleBindingError(name)
  return binding
}`
}
