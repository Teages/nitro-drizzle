import { defineRelations } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const counts = sqliteTable('counts', {
  // SQLite's non-integer PRIMARY KEY does not imply NOT NULL, and drizzle-kit
  // omits NOT NULL on primary keys in generated SQL — the constraint is
  // declared here at the drizzle layer, and every write supplies the UUID.
  id: text('id').notNull().primaryKey().$default(() => crypto.randomUUID()),
  title: text('title').notNull(),
})

export const relations = defineRelations({ counts }, () => ({}))
