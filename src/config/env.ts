import type { DatabaseConnection } from '../types'
import { snakeCase } from 'scule'

export interface NitroEnvOptions {
  readonly env: Readonly<Record<string, string | undefined>>
  /** Alternative override prefix from `runtimeConfig.nitro.envPrefix`. */
  readonly envPrefix?: string
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
 * Applies Nitro's runtime-config env semantics to a connection object:
 * `<prefix>DRIZZLE_CONNECTION_*` overrides first (snake-cased key path,
 * `NITRO_` prefix with the configured alternative prefix as fallback), then
 * `{{VAR}}` expansion on string values when enabled. Mirrors `applyEnv`
 * from Nitro's internal runtime config, which is not publicly exported —
 * keep the semantics in sync with Nitro when upgrading.
 */
export function applyNitroEnv(
  connection: DatabaseConnection,
  options: NitroEnvOptions,
): DatabaseConnection {
  const altPrefix = options.envPrefix ?? options.env.NITRO_ENV_PREFIX ?? '_'

  const walk = (obj: Record<string, unknown>, parentKey: string): void => {
    for (const key in obj) {
      const subKey = parentKey === '' ? key : `${parentKey}_${key}`
      const envName = snakeCase(subKey).toUpperCase()
      const envValue
        = options.env[`NITRO_${envName}`] ?? options.env[`${altPrefix}${envName}`]
      if (isObject(obj[key])) {
        walk(obj[key], subKey)
      }
      else {
        obj[key] = envValue ?? obj[key]
      }
      if (options.envExpansion && typeof obj[key] === 'string') {
        obj[key] = expandFromEnv(obj[key] as string, options.env)
      }
    }
  }

  const result: Record<string, unknown> = { ...connection }
  walk(result, 'DRIZZLE_CONNECTION')
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
