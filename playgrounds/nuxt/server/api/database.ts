import { sql } from 'drizzle-orm'
import { defineHandler } from 'nitro'
import { useDrizzle } from '#drizzle'

export default defineHandler(async () => {
  const { db, schema } = useDrizzle()
  await db.run(sql`select 1`)
  return {
    connected: typeof db === 'object',
    tables: Object.keys(schema),
  }
})
