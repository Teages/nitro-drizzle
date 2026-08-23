import { describe, expect, it } from 'vitest'
import { createD1HttpTransport } from '../../src/drivers/d1-http'

const credentials = {
  accountId: 'account-id',
  apiToken: 'api-token',
  databaseId: 'database-id',
}

function d1Response(rows: readonly (readonly unknown[])[]): Response {
  return Response.json({
    success: true,
    result: [{ success: true, results: { rows } }],
  })
}

describe('createD1HttpTransport', () => {
  it('returns undefined for an empty get result', async () => {
    // Given
    const transport = createD1HttpTransport(
      credentials,
      async () => d1Response([]),
    )

    // When
    const result = await transport.query('SELECT 1', [], 'get')

    // Then
    expect(result).toEqual({ rows: undefined })
  })

  it('returns the first row for a non-empty get result', async () => {
    // Given
    const transport = createD1HttpTransport(
      credentials,
      async () => d1Response([[1, 'alice'], [2, 'bob']]),
    )

    // When
    const result = await transport.query('SELECT id, name FROM users', [], 'get')

    // Then
    expect(result).toEqual({ rows: [1, 'alice'] })
  })
})
