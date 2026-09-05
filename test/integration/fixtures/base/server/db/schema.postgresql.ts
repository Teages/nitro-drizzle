import { defineRelations } from 'drizzle-orm'
import { pgTable, text } from 'drizzle-orm/pg-core'

export const counts = pgTable('counts', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  title: text('title').notNull(),
})

export const relations = defineRelations({ counts }, () => ({}))
