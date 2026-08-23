import type { DrizzleDriverConfig } from '../../../src/drivers/contracts'
import type { WranglerConfig } from '../../../src/module/cloudflare/bindings'
import { describe, expect, it } from 'vitest'
import { mutateWranglerBindings } from '../../../src/module/cloudflare/bindings'
import { requiresRequestContext } from '../../../src/module/cloudflare/request-context'

describe('mutateWranglerBindings', () => {
  it('adds an explicitly configured D1 binding once', () => {
    // Given
    const wrangler: WranglerConfig = {}
    const config: DrizzleDriverConfig = {
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
    const config: DrizzleDriverConfig = {
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
    const config: DrizzleDriverConfig = {
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
    const boundConfig: DrizzleDriverConfig = {
      dialect: 'postgresql',
      driver: 'postgres-js',
      connection: { hyperdriveId: 'hyperdrive-id' },
    }
    const directConfig: DrizzleDriverConfig = {
      dialect: 'postgresql',
      driver: 'postgres-js',
      connection: { url: 'postgres://localhost/database' },
    }
    const d1Config: DrizzleDriverConfig = {
      dialect: 'sqlite',
      driver: 'd1',
    }

    // Then
    expect(requiresRequestContext(boundConfig)).toBe(true)
    expect(requiresRequestContext(directConfig)).toBe(false)
    expect(requiresRequestContext(d1Config)).toBe(true)
  })
})
