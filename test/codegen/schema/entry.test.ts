import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSchemaEntry, createSchemaTypes } from '../../../src/codegen/schema/entry'

const rootDir = '/workspace/project'

describe('createSchemaEntry', () => {
  it('imports one schema entry and separates its relations export', () => {
    // Given
    const schemaPath = join(rootDir, 'server/db/schema.ts')

    // When
    const entry = createSchemaEntry(schemaPath)

    // Then
    expect(entry).toContain(
      `import * as source from "${schemaPath}"`,
    )
    expect(entry).toContain('export const { ["relations"]: relations = {}, ...schema } = source')
  })

  it('maps a custom relations export to the generated relations value', () => {
    // Given
    const schemaPath = join(rootDir, 'server/db/schema.ts')

    // When
    const entry = createSchemaEntry(schemaPath, 'appRelations')

    // Then
    expect(entry).toContain(
      'const { ["appRelations"]: relations, ...schema } = source',
    )
    expect(entry).toContain(
      'Schema entry does not export the configured relations value',
    )
    expect(entry).toContain('export { relations, schema }')
  })

  it('requires a configured relations export in generated types', () => {
    // Given
    const schemaPath = join(rootDir, 'server/db/schema.ts')
    const schemaTypesFile = join(rootDir, '.nitro/drizzle/schema.d.mts')

    // When
    const types = createSchemaTypes(
      schemaTypesFile,
      schemaPath,
      'appRelations',
    )

    // Then
    expect(types).toContain(
      'export declare const relations: SchemaSource["appRelations"]',
    )
  })
})
