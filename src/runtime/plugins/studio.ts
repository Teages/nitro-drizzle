import type {} from '../augmentations'
import type { RunningStudioServer } from '../studio/server'
import process from 'node:process'
import { consola } from 'consola'
import { definePlugin } from 'nitro'
import { drizzleConfig } from '#drizzle/config'
import { startStudioServer, studioLink } from '../studio/server'

const logger = consola.withTag('@teages/nitro-drizzle/studio')

/**
 * Starts the local Drizzle Studio proxy for the dev database. The web app at
 * the configured `drizzle.dev.studio.studioUrl` (local.drizzle.studio by
 * default) connects back to a loopback port on this process; the proxy is the
 * only path to the studio route and enforces both the Studio origin and the
 * compile-time auth key.
 */
export default definePlugin((nitro) => {
  // Studio pairs exclusively with the dev database: real connections should
  // use `drizzle-kit studio`, which owns its full driver matrix.
  if (!import.meta.dev || drizzleConfig.dev !== true || process.env.VITEST !== undefined) {
    return
  }
  const authKey = import.meta.DRIZZLE_STUDIO_KEY
  const studio = drizzleConfig.devStudio
  if (authKey === undefined || authKey === '' || studio === undefined) {
    return
  }

  // This generation's handle; the close hook closes only the proxy this
  // worker started, so a superseded worker's late hook cannot kill its
  // replacement (closing is ownership-checked inside the lifecycle queue).
  let running: RunningStudioServer | undefined

  startStudioServer({
    authorization: `Bearer ${authKey}`,
    studioUrl: studio.studioUrl,
    ...(studio.port === undefined ? {} : { port: studio.port }),
  })
    .then((server) => {
      running = server
      if (!studio.silent) {
        logger.info(`Drizzle Studio: ${studioLink(studio.studioUrl, server.port)}`)
      }
    })
    .catch((error: unknown) => {
      logger.error('Failed to start the Drizzle Studio proxy:', error)
    })

  // Awaited on purpose: nitro restarts the dev worker in-place, and the next
  // worker's proxy must not race this close (fatal with a fixed port).
  nitro.hooks.hook('close', async () => {
    await running?.close()
  })
})
