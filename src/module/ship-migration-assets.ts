import type { Nitro } from 'nitro/types'
import type { DrizzleArtifactsLifecycle } from './artifacts-lifecycle'
import { cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * Ships the collected runtime migration assets into the server output on
 * every compiled build.
 */
export function configureOutputAssets(
  nitro: Nitro,
  artifacts: DrizzleArtifactsLifecycle,
): void {
  nitro.hooks.hook('compiled', async () => {
    await artifacts.refreshAssets()
    const outputAssets = resolve(nitro.options.output.serverDir, 'db')
    await mkdir(outputAssets, { recursive: true })
    await cp(artifacts.runtimeAssetsFolder, outputAssets, { recursive: true })
  })
}
