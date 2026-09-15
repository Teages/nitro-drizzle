import { defineHandler } from 'nitro'
import { useDrizzle } from '#drizzle'

export default defineHandler(async () => {
  const { db } = useDrizzle()
  const rows = await db.all<{ user_version: number }>('PRAGMA user_version')
  return { userVersion: rows[0]?.user_version ?? 0 }
})
