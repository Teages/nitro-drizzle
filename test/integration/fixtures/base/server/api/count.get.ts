import { count } from 'drizzle-orm'
import { defineHandler } from 'nitro'
import { useDrizzle } from '#drizzle'

export default defineHandler(async () => {
  const { db, schema } = useDrizzle()
  return (await db.select({ count: count() }).from(schema.counts)).at(0) ?? { count: 0 }
})
