import type { Nitro } from 'nitro/types'
import type { ResolvedDrizzleConfig } from '../../contracts/configuration'
import type { WranglerConfig } from './bindings'
import { mutateWranglerBindings } from './bindings'
import { requiresRequestContext } from './request-context'

export function configureCloudflare(
  nitro: Nitro,
  config: ResolvedDrizzleConfig,
): void {
  const wrangler: WranglerConfig = {}
  const mutation = mutateWranglerBindings(wrangler, config)
  if (mutation.d1 || mutation.hyperdrive) {
    nitro.options.cloudflare ??= {}
    const existingWrangler = nitro.options.cloudflare.wrangler
    nitro.options.cloudflare.wrangler = {
      ...existingWrangler,
      ...wrangler,
      ...(wrangler.d1_databases === undefined
        ? {}
        : {
            d1_databases: [
              ...(existingWrangler?.d1_databases ?? [])
                .filter(binding => binding.binding !== 'DB'),
              ...wrangler.d1_databases,
            ],
          }),
      ...(wrangler.hyperdrive === undefined
        ? {}
        : {
            hyperdrive: [
              ...(existingWrangler?.hyperdrive ?? [])
                .filter(binding =>
                  !wrangler.hyperdrive?.some(owned =>
                    owned.binding === binding.binding,
                  ),
                ),
              ...wrangler.hyperdrive,
            ],
          }),
    }
  }
  if (
    requiresRequestContext(config)
    && nitro.options.experimental.asyncContext !== true
  ) {
    throw new Error(
      `The ${config.driver} driver resolves its Cloudflare binding from the Nitro request context, which needs \`experimental.asyncContext: true\` in your Nitro config.`,
    )
  }
}
