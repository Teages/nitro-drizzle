import type { DatabaseConnection } from '../contracts/public'

export interface NitroEnvOptions {
  readonly env: Readonly<Record<string, string | undefined>>
  readonly envExpansion: boolean
}

const ENV_EXPANSION_PATTERN = /\{\{([^{}]*)\}\}/g

function isObject(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
}

/**
 * Expands `{{VAR}}` references the way Nitro's runtime does: missing (or
 * empty) variables keep the literal `{{VAR}}` text.
 */
function expandFromEnv(
  value: string,
  env: Readonly<Record<string, string | undefined>>,
): string {
  return value.replace(ENV_EXPANSION_PATTERN, (match, key: string) => {
    return env[key] || match
  })
}

/**
 * Expands `{{VAR}}` templates in string connection values, gated by the
 * user's `experimental.envExpansion` setting exactly like Nitro applies it
 * to its own runtime config. Mirrors `_expandFromEnv` from Nitro's internal
 * runtime config, which is not publicly exported — keep the semantics in
 * sync with Nitro when upgrading.
 */
export function expandNitroEnv(
  connection: DatabaseConnection,
  options: NitroEnvOptions,
): DatabaseConnection {
  if (!options.envExpansion) {
    return connection
  }
  const walk = (obj: Record<string, unknown>): void => {
    for (const key in obj) {
      if (isObject(obj[key])) {
        walk(obj[key])
      }
      else if (typeof obj[key] === 'string') {
        obj[key] = expandFromEnv(obj[key] as string, options.env)
      }
    }
  }
  const result: Record<string, unknown> = { ...connection }
  walk(result)
  return result as DatabaseConnection
}

/**
 * Collects `{{VAR}}` template names used in connection values, used to warn
 * when env expansion is not enabled and the literals would reach the driver.
 */
export function findEnvTemplateKeys(
  connection: DatabaseConnection,
): readonly string[] {
  const keys = new Set<string>()
  for (const value of Object.values(connection)) {
    if (typeof value !== 'string') {
      continue
    }
    for (const match of value.matchAll(ENV_EXPANSION_PATTERN)) {
      keys.add(match[1])
    }
  }
  return [...keys]
}
