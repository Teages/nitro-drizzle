import type { DrizzleDevStudioOptions } from '../types'

export const DEFAULT_STUDIO_URL = 'https://local.drizzle.studio'

export interface ResolvedDevStudio {
  /** Fixed proxy port; `undefined` selects a random port per start. */
  readonly port: number | undefined
  readonly silent: boolean
  readonly studioUrl: string
}

export class DrizzleDevStudioError extends Error {
  constructor(
    readonly code: 'invalid_port' | 'invalid_url',
    message: string,
  ) {
    super(message)
    this.name = 'DrizzleDevStudioError'
  }
}

/**
 * Normalizes `drizzle.devMock.studio`. `false` disables the studio and resolves to
 * `undefined`; `undefined` and `true` apply the defaults. Values are
 * validated up front so a broken config fails the build, not the dev server.
 */
export function resolveDevStudio(
  options: boolean | DrizzleDevStudioOptions | undefined,
): ResolvedDevStudio | undefined {
  if (options === false) {
    return undefined
  }
  const config = options === true || options === undefined ? {} : options

  if (config.port !== undefined) {
    if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
      throw new DrizzleDevStudioError(
        'invalid_port',
        `drizzle.devMock.studio.port must be an integer between 1 and 65535, got ${JSON.stringify(config.port)}.`,
      )
    }
  }

  const studioUrl = config.studioUrl ?? DEFAULT_STUDIO_URL
  let parsed: URL
  try {
    parsed = new URL(studioUrl)
  }
  catch {
    throw new DrizzleDevStudioError(
      'invalid_url',
      `drizzle.devMock.studio.studioUrl must be an absolute http(s) URL, got ${JSON.stringify(studioUrl)}.`,
    )
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new DrizzleDevStudioError(
      'invalid_url',
      `drizzle.devMock.studio.studioUrl must use http or https, got ${JSON.stringify(studioUrl)}.`,
    )
  }

  return {
    port: config.port,
    silent: config.silent ?? false,
    studioUrl,
  }
}
