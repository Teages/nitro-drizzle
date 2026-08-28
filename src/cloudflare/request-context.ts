import type { ResolvedDrizzleConfig } from '../contracts/configuration'

/**
 * d1 and Hyperdrive drivers resolve their database from the Nitro request
 * context via `useRequest()`. The caller must reject configurations that use
 * these drivers without `experimental.asyncContext: true` — enabling
 * experimental features is the user's decision, not the module's.
 */
export function requiresRequestContext(config: ResolvedDrizzleConfig): boolean {
  return config.driver === 'd1'
    || (
      (config.driver === 'postgres-js' || config.driver === 'mysql2')
      && config.connection?.hyperdriveId !== undefined
    )
}
