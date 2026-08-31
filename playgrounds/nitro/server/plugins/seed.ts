import { definePlugin } from 'nitro'
import { useDrizzle } from '#drizzle'

export default definePlugin((nitro) => {
  nitro.hooks.hook('drizzle:dev-mock:seed', async () => {
    const { db, schema } = useDrizzle()
    await db.insert(schema.notes).values({ title: 'Hello, world!' })
  })
})
