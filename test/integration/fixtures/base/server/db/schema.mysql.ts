import { defineRelations } from 'drizzle-orm'
import { mysqlTable, text, varchar } from 'drizzle-orm/mysql-core'

export const counts = mysqlTable('counts', {
  // MySQL cannot index a TEXT column without a key length, so the UUID key
  // is a varchar here while sqlite/postgresql keep `text`.
  id: varchar('id', { length: 36 }).primaryKey().$default(() => crypto.randomUUID()),
  title: text('title').notNull(),
})

export const relations = defineRelations({ counts }, () => ({}))
