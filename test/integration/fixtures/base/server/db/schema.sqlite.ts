import { defineRelations } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const counts = sqliteTable('counts', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  title: text('title').notNull(),
})

export const relations = defineRelations({ counts }, () => ({}))
