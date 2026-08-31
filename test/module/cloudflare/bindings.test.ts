import type { WranglerConfig } from '../../../src/cloudflare/bindings'
import type { ResolvedDrizzleConfig } from '../../../src/configuration/resolve'
import { describe, expect, it } from 'vitest'
import { mutateWranglerBindings } from '../../../src/cloudflare/bindings'
import { requiresRequestContext } from '../../../src/cloudflare/request-context'

describe('mutateWranglerBindings', () => {
  it('adds an explicitly configured D1 binding once', () => {
    // Given
    const wrangler: WranglerConfig = {}
    const config: ResolvedDrizzleConfig = {
      dialect: 'sqlite',
      driver: 'd1',
      connection: { databaseId: 'database-id' },
    }

    // When
    const first = mutateWranglerBindings(wrangler, config)
    const second = mutateWranglerBindings(wrangler, config)

    // Then
    expect(first).toEqual({ d1: true, hyperdrive: false, requestContext: true })
    expect(second).toEqual(first)
    expect(wrangler.d1_databases).toEqual([
      { binding: 'DB', database_id: 'database-id' },
    ])
  })

  it('adds an explicitly configured Hyperdrive binding', () => {
    // Given
    const wrangler: WranglerConfig = {}
    const config: ResolvedDrizzleConfig = {
      dialect: 'postgresql',
      driver: 'postgres-js',
      connection: { hyperdriveId: 'hyperdrive-id' },
    }

    // When
    const result = mutateWranglerBindings(wrangler, config)

    // Then
    expect(result).toEqual({ d1: false, hyperdrive: true, requestContext: true })
    expect(wrangler.hyperdrive).toEqual([
      { binding: 'POSTGRES', id: 'hyperdrive-id' },
    ])
  })

  it('does not infer bindings from dialect or driver alone', () => {
    // Given
    const wrangler: WranglerConfig = {}
    const config: ResolvedDrizzleConfig = {
      dialect: 'postgresql',
      driver: 'postgres-js',
      connection: { url: 'postgres://localhost/database' },
    }

    // When
    const result = mutateWranglerBindings(wrangler, config)

    // Then
    expect(result).toEqual({ d1: false, hyperdrive: false, requestContext: false })
    expect(wrangler).toEqual({})
  })
})

describe('requiresRequestContext', () => {
  it('holds only for explicit binding-only configurations', () => {
    // Given
    const boundConfig: ResolvedDrizzleConfig = {
      dialect: 'postgresql',
      driver: 'postgres-js',
      connection: { hyperdriveId: 'hyperdrive-id' },
    }
    const directConfig: ResolvedDrizzleConfig = {
      dialect: 'postgresql',
      driver: 'postgres-js',
      connection: { url: 'postgres://localhost/database' },
    }
    const d1Config: ResolvedDrizzleConfig = {
      dialect: 'sqlite',
      driver: 'd1',
    }

    // Then
    expect(requiresRequestContext(boundConfig)).toBe(true)
    expect(requiresRequestContext(directConfig)).toBe(false)
    expect(requiresRequestContext(d1Config)).toBe(true)
  })
})
