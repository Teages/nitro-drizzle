import type { ResolvedDrizzleConfig } from '../configuration/resolve'

export interface WranglerD1Binding {
  binding: string
  database_id: string
  database_name?: string
}

export interface WranglerHyperdriveBinding {
  binding: string
  id: string
  localConnectionString?: string
}

/**
 * This intentionally models only the Wrangler keys owned by this package.
 * The object is mutable because Nitro passes its live Wrangler configuration.
 */
export interface WranglerConfig {
  d1_databases?: WranglerD1Binding[]
  hyperdrive?: WranglerHyperdriveBinding[]
}

export interface WranglerBindingMutation {
  readonly d1: boolean
  readonly hyperdrive: boolean
  readonly requestContext: boolean
}

function upsertD1Binding(wrangler: WranglerConfig, databaseId: string): void {
  wrangler.d1_databases ??= []
  const existing = wrangler.d1_databases.find(binding => binding.binding === 'DB')
  if (existing === undefined) {
    wrangler.d1_databases.push({
      binding: 'DB',
      database_id: databaseId,
    })
    return
  }
  existing.database_id = databaseId
}

function upsertHyperdriveBinding(
  wrangler: WranglerConfig,
  bindingName: 'POSTGRES' | 'MYSQL',
  hyperdriveId: string,
): void {
  wrangler.hyperdrive ??= []
  const existing = wrangler.hyperdrive.find(binding => binding.binding === bindingName)
  if (existing === undefined) {
    wrangler.hyperdrive.push({
      binding: bindingName,
      id: hyperdriveId,
    })
    return
  }
  existing.id = hyperdriveId
}

export function mutateWranglerBindings(
  wrangler: WranglerConfig,
  config: ResolvedDrizzleConfig,
): WranglerBindingMutation {
  const databaseId = config.connection?.databaseId
  const usesD1Binding = config.driver === 'd1' && databaseId !== undefined
  if (usesD1Binding) {
    upsertD1Binding(wrangler, databaseId)
  }

  const hyperdriveId = config.connection?.hyperdriveId
  const bindingName = config.driver === 'postgres-js'
    ? 'POSTGRES'
    : config.driver === 'mysql2'
      ? 'MYSQL'
      : undefined
  const usesHyperdrive = hyperdriveId !== undefined && bindingName !== undefined
  if (usesHyperdrive) {
    upsertHyperdriveBinding(wrangler, bindingName, hyperdriveId)
  }

  return {
    d1: usesD1Binding,
    hyperdrive: usesHyperdrive,
    requestContext: usesD1Binding || usesHyperdrive,
  }
}
