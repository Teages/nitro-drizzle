import type { DrizzleOptions } from '../types'

export class DrizzleClientError extends Error {
  constructor(
    readonly code:
      | 'binding_only'
      | 'invalid_connection'
      | 'initialization_failed',
    readonly driver: DrizzleOptions['driver'],
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'DrizzleClientError'
  }
}
