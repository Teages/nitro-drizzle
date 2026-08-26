import { defineHandler, HTTPError } from 'nitro/h3'
import { useDrizzle } from '#drizzle'
import { drizzleConfig } from '#drizzle/config'
import { createStudioExecutor } from './adapters'
import { handleStudioProtocol, studioCorsHeaders, validateStudioAuthorization } from './protocol'

export default defineHandler(async (event) => {
  const authError = validateStudioAuthorization(
    import.meta.DRIZZLE_STUDIO_KEY,
    event.req.headers.get('authorization'),
  )
  if (authError === 'not-configured') {
    throw HTTPError.status(404, 'Not Found')
  }
  if (authError === 'unauthorized') {
    throw HTTPError.status(401, 'Unauthorized')
  }

  if (event.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: studioCorsHeaders,
    })
  }
  if (event.req.method !== 'POST') {
    throw HTTPError.status(405, 'Method Not Allowed')
  }

  const engine = drizzleConfig.devEngine
  if (engine === undefined) {
    // No dev database: the studio route is not wired for real connections.
    throw HTTPError.status(404, 'Not Found')
  }
  const body = await event.req.json()
  const executor = createStudioExecutor(engine, useDrizzle().db)
  return await handleStudioProtocol(executor, {
    dialect: drizzleConfig.dialect,
    engine,
    connection: drizzleConfig.devConnection,
  }, body)
})
