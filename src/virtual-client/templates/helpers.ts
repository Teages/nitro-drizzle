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
 *
 * `mock` marks the dev-baked variant — the module only exists in a session
 * that activated the dev database, so `mockDb` carries the same instance as
 * `db`. Runtime-resolved sources pass nothing and expose `mockDb: undefined`.
 *
 * The body argument shifts meaning with the variant: runtime sources pass
 * `initDrizzle` statements, dev sources pass the drizzle config object
 * literal. The dev variant exposes that object through `devDrizzleConfig()`:
 * the dev-database plugin runs it through the `drizzle:dev-mock:config`
 * hook and injects the mutated object back via `configureDevDrizzle`, so the
 * same object the handlers saw reaches `drizzle()` — an untouched fallback
 * keeps the baked config for code constructing before the plugin ran.
 */
export function lazyUseDrizzleSource(
  imports: SourceImports,
  body: string,
  mock?: boolean,
): string {
  const init = mock === true
    ? `export function devDrizzleConfig() {
  return ${body}
}

let _config

/**
 * Internal to the dev database: the runtime plugin injects the
 * \`drizzle:dev-mock:config\` hook result before the first \`useDrizzle()\`.
 */
export function configureDevDrizzle(config) {
  _config = config
}

function initDrizzle() {
  return drizzle(_config ?? devDrizzleConfig())
}`
    : `function initDrizzle() {
${body}
}`
  return `${sourceHeader(imports)}

let _db = null

${init}

export function useDrizzle() {
  _db ??= initDrizzle()
  return { db: _db, schema, relations, mockDb: ${mock === true ? '_db' : 'undefined'} }
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
