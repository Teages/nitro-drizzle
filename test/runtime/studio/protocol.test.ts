import type { StudioExecutor } from '../../../src/runtime/studio/adapters'
import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import {
  handleStudioProtocol,
  studioDatabaseHash,
  validateStudioAuthorization,
} from '../../../src/runtime/studio/protocol'

const initContext = {
  dialect: 'sqlite' as const,
  engine: 'better-sqlite3' as const,
  connection: ':memory:',
}

function fakeExecutor(overrides: Partial<StudioExecutor> = {}): StudioExecutor {
  return {
    query: async () => [],
    transaction: async () => [],
    ...overrides,
  }
}

describe('validateStudioAuthorization', () => {
  it('rejects when the key is not configured and when the bearer value differs', () => {
    expect(validateStudioAuthorization(undefined, null)).toBe('not-configured')
    expect(validateStudioAuthorization('', 'Bearer x')).toBe('not-configured')
    expect(validateStudioAuthorization('secret', null)).toBe('unauthorized')
    expect(validateStudioAuthorization('secret', 'bearer secret')).toBe('unauthorized')
    expect(validateStudioAuthorization('secret', 'Bearer secret')).toBeUndefined()
  })
})

describe('handleStudioProtocol', () => {
  it('answers init with the negotiated protocol version and identity', async () => {
    const response = await handleStudioProtocol(fakeExecutor(), initContext, { type: 'init' })
    await expect(response.json()).resolves.toMatchObject({
      version: '6.3',
      dialect: 'sqlite',
      driver: 'better-sqlite3',
      packageName: 'better-sqlite3',
      schemaFiles: [],
      customDefaults: [],
      relations: [],
      dbHash: studioDatabaseHash(initContext),
      databaseName: ':memory:',
    })
  })

  it('returns CORS headers on preflight-free responses', async () => {
    const response = await handleStudioProtocol(fakeExecutor(), initContext, { type: 'init' })
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Private-Network')).toBe('true')
  })

  it('rejects malformed requests with a 400', async () => {
    const response = await handleStudioProtocol(fakeExecutor(), initContext, { type: 'nonsense' })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      status: 'error',
      error: 'Invalid Studio protocol request',
    })
  })

  it('forwards proxy queries to the executor', async () => {
    const executor = fakeExecutor({
      query: async data => [{ echo: data.sql, params: data.params }],
    })
    const response = await handleStudioProtocol(executor, initContext, {
      type: 'proxy',
      data: { sql: 'SELECT 1', params: [1], method: 'all' },
    })
    await expect(response.json()).resolves.toEqual([
      { echo: 'SELECT 1', params: [1] },
    ])
  })

  it('serializes errors, dates, bigints and buffers for the frontend', async () => {
    const executor = fakeExecutor({
      query: async () => [
        {
          when: new Date('2026-08-25T00:00:00.000Z'),
          big: 9007199254740993n,
          blob: Buffer.from('hello'),
          nested: { error: new Error('boom') },
        },
      ],
    })
    const response = await handleStudioProtocol(executor, initContext, {
      type: 'proxy',
      data: { sql: 'SELECT 1', method: 'all' },
    })
    await expect(response.json()).resolves.toEqual([
      {
        when: '2026-08-25T00:00:00.000Z',
        big: '9007199254740993',
        blob: Buffer.from('hello').toString('base64'),
        nested: { error: { error: 'boom' } },
      },
    ])
  })

  it('runs bproxy benchmarks and reports timings per repeat', async () => {
    const executor = fakeExecutor({ query: async () => [] })
    const response = await handleStudioProtocol(executor, initContext, {
      type: 'bproxy',
      data: { query: { sql: 'SELECT 1' }, repeats: 3 },
    })
    const timings = (await response.json()) as number[]
    expect(timings).toHaveLength(3)
    for (const timing of timings) {
      expect(typeof timing).toBe('number')
    }
  })

  it('reports custom defaults as unsupported', async () => {
    const response = await handleStudioProtocol(fakeExecutor(), initContext, {
      type: 'defaults',
      data: [{ schema: 'main', table: 'users', column: 'id' }],
    })
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      status: 'error',
      error: 'Custom defaults are not configured',
    })
  })
})

describe('studioDatabaseHash', () => {
  it('separates engines and connections, normalizing implicit memory', () => {
    const base = studioDatabaseHash(initContext)
    expect(studioDatabaseHash({ ...initContext, engine: 'node-sqlite' })).not.toBe(base)
    expect(studioDatabaseHash({ ...initContext, connection: './dev.db' })).not.toBe(base)
    // An absent connection means in-memory, same as an explicit `:memory:`.
    expect(studioDatabaseHash({ ...initContext, connection: undefined })).toBe(base)
  })
})
