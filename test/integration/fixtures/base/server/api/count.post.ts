import { defineHandler } from 'nitro'
import { useDrizzle } from '#drizzle'

export default defineHandler(async () => {
  const { db, schema } = useDrizzle()
  await db.insert(schema.counts).values([{
    title: crypto.randomUUID(),
  }])
})
