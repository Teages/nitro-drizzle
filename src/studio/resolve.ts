import type { DrizzleDevStudioOptions } from '../types'
import { createStudioLocalhostDomain } from './localhost-domain'

export const DEFAULT_STUDIO_URL = 'https://local.drizzle.studio'

/** Normalized `drizzle.devMock.studio` for the module and the runtime. */
export interface ResolvedDevStudio {
  /** Per-session `<uuid>.localhost` domain: the Host the studio answers to. */
  readonly localhostDomain: string
  readonly silent: boolean
  readonly studioUrl: string
}

export class DrizzleDevStudioError extends Error {
  constructor(
    readonly code: 'invalid_url',
    message: string,
  ) {
    super(message)
    this.name = 'DrizzleDevStudioError'
  }
}

/** Validates up front so a broken config fails the build, not the dev server. */
export function resolveDevStudio(
  options: boolean | DrizzleDevStudioOptions | undefined,
): ResolvedDevStudio | undefined {
  if (options === false) {
    return undefined
  }
  const config: DrizzleDevStudioOptions = options === true || options === undefined ? {} : options

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
    localhostDomain: createStudioLocalhostDomain(),
    silent: config.silent ?? false,
    studioUrl,
  }
}
