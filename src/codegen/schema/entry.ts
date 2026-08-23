import { dirname, relative } from 'node:path'

function relativeModuleSpecifier(fromFile: string, toFile: string): string {
  const path = relative(dirname(fromFile), toFile).replaceAll('\\', '/')
  return path.startsWith('.') ? path : `./${path}`
}

function typeModuleSpecifier(fromFile: string, toFile: string): string {
  return relativeModuleSpecifier(fromFile, toFile).replace(/\.ts$/, '')
}

function absoluteModuleSpecifier(path: string): string {
  return JSON.stringify(path.replaceAll('\\', '/'))
}

/**
 * Virtual `#drizzle/schema` module: imports one explicit schema entry and
 * separates its optional `relations` export from its table exports. The host
 * bundler owns the complete dependency graph in development and production.
 */
export function createSchemaEntry(
  schemaPath: string,
  relationsExport?: string,
): string {
  const relationsKey = JSON.stringify(relationsExport ?? 'relations')
  if (relationsExport !== undefined) {
    return [
      `import * as source from ${absoluteModuleSpecifier(schemaPath)}`,
      `const { [${relationsKey}]: relations, ...schema } = source`,
      'if (relations === undefined) {',
      `  throw new Error(${JSON.stringify(`Schema entry does not export the configured relations value "${relationsExport}".`)})`,
      '}',
      'export { relations, schema }',
      '',
    ].join('\n')
  }
  return [
    `import * as source from ${absoluteModuleSpecifier(schemaPath)}`,
    `export const { [${relationsKey}]: relations = {}, ...schema } = source`,
    '',
  ].join('\n')
}

export function createSchemaTypes(
  schemaTypesFile: string,
  schemaPath: string,
  relationsExport?: string,
): string {
  const specifier = JSON.stringify(
    typeModuleSpecifier(schemaTypesFile, schemaPath),
  )
  const relationsKey = JSON.stringify(relationsExport ?? 'relations')
  if (relationsExport !== undefined) {
    return [
      `type SchemaSource = typeof import(${specifier})`,
      `export declare const schema: Omit<SchemaSource, ${relationsKey}>`,
      `export declare const relations: SchemaSource[${relationsKey}]`,
      '',
    ].join('\n')
  }
  return [
    `type SchemaSource = typeof import(${specifier})`,
    `export declare const schema: Omit<SchemaSource, ${relationsKey}>`,
    'export declare const relations: SchemaSource extends {',
    `  ${relationsKey}: infer Relations`,
    '} ? Relations : Record<string, never>',
    '',
  ].join('\n')
}
