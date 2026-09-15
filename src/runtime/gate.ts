import { defineHandler } from 'nitro/h3'
import { awaitDrizzleReady } from './lifecycle'

/**
 * Nitro swallows request-hook rejections, so failed initialization would
 * keep routing into handlers; a throwing middleware fails the request.
 */
export default defineHandler(() => awaitDrizzleReady())
