import { defineHandler } from 'nitro'
import { useDrizzle } from '#drizzle'

export default defineHandler(() => {
  const { db, mockDb } = useDrizzle()
  return { mocked: mockDb !== undefined, same: mockDb === db }
})
