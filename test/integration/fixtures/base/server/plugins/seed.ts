import { definePlugin } from 'nitro'
import { useDrizzle } from '#drizzle'

export default definePlugin((nitro) => {
  nitro.hooks.hook('drizzle:dev-mock:seed', async () => {
    const { db, schema } = useDrizzle()
    await db.insert(schema.counts).values({ title: 'Hello, world!' })
  })
})
