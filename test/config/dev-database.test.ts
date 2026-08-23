import type { DrizzleDevOptions } from '../../src/types'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertLocalDriverInstalled,
  detectDevRuntimeEngines,
  DrizzleDevDatabaseError,
  resolveDevDatabase,
} from '../../src/config/dev-database'

const noEngines = { bun: false, nodeSqlite: false }
const emptyEnv: Record<string, string | undefined> = {}

function resolveDev(
  dev: true | DrizzleDevOptions,
  dialect: 'postgresql' | 'sqlite',
  driver: string,
  runtime = noEngines,
  env: Record<string, string | undefined> = emptyEnv,
) {
  return resolveDevDatabase({
    dev,
    dialect,
    driver: driver as 'libsql',
    env,
    runtime,
  })
}

describe('resolveDevDatabase', () => {
  it('always resolves pglite for postgresql', () => {
    // Given / When
    const resolved = resolveDev(true, 'postgresql', 'postgres-js')

    // Then
    expect(resolved).toEqual({ engine: 'pglite', connection: undefined })
  })

  it('prefers bun:sqlite when running under bun', () => {
    // Given / When
    const resolved = resolveDev(true, 'sqlite', 'libsql', {
      bun: true,
      nodeSqlite: true,
    })

    // Then
    expect(resolved.engine).toBe('bun-sqlite')
    expect(resolved.connection).toBe(':memory:')
  })

  it('uses node:sqlite when the runtime exposes it', () => {
    // Given / When
    const resolved = resolveDev(true, 'sqlite', 'd1', {
      bun: false,
      nodeSqlite: true,
    })

    // Then
    expect(resolved.engine).toBe('node-sqlite')
  })

  it('falls back to the main driver when it can run locally', () => {
    // Given / When
    const resolved = resolveDev(true, 'sqlite', 'better-sqlite3')

    // Then
    expect(resolved.engine).toBe('better-sqlite3')
  })

  it('rejects the cascade when no local sqlite engine exists', () => {
    // Given / When / Then
    expect(() => resolveDev(true, 'sqlite', 'd1-http'))
      .toThrow(DrizzleDevDatabaseError)
    expect(() => resolveDev(true, 'sqlite', 'd1-http'))
      .toThrow(/drizzle\.dev\.driver/)
  })

  it('rejects the mysql dialect outright', () => {
    // Given / When / Then
    expect(() =>
      resolveDevDatabase({
        dev: true,
        dialect: 'mysql',
        driver: 'mysql2',
        env: emptyEnv,
        runtime: noEngines,
      }),
    ).toThrow(/does not support the dev database/)
  })

  it('honors an explicit local driver over the cascade', () => {
    // Given / When
    const resolved = resolveDev(
      { driver: 'libsql' },
      'sqlite',
      'better-sqlite3',
      { bun: true, nodeSqlite: true },
    )

    // Then
    expect(resolved.engine).toBe('libsql')
  })

  it('rejects an explicit driver from another dialect', () => {
    // Given / When / Then
    expect(() => resolveDev({ driver: 'libsql' }, 'postgresql', 'postgres-js'))
      .toThrow(/not a local postgresql engine/)
  })

  it('rejects an explicit non-local driver', () => {
    // Given
    const driver = 'neon-http' as unknown as DrizzleDevOptions['driver']

    // When / Then
    expect(() => resolveDev({ driver }, 'postgresql', 'postgres-js'))
      .toThrow(/not a local postgresql engine/)
  })

  it('keeps the dev database in memory by default', () => {
    // Given / When
    const resolved = resolveDev(true, 'sqlite', 'libsql')

    // Then
    expect(resolved.connection).toBe(':memory:')
  })

  it('prefixes libsql file paths with file:', () => {
    // Given / When
    const resolved = resolveDev({ file: '.data/dev.db' }, 'sqlite', 'libsql')

    // Then
    expect(resolved.connection).toBe('file:.data/dev.db')
  })

  it('keeps already-prefixed libsql URLs untouched', () => {
    // Given / When
    const resolved = resolveDev(
      { file: 'file:.data/dev.db' },
      'sqlite',
      'libsql',
    )

    // Then
    expect(resolved.connection).toBe('file:.data/dev.db')
  })

  it('uses raw paths for engines that take filesystem locations', () => {
    // Given / When
    const sqlite = resolveDev({ file: '.data/dev.db' }, 'sqlite', 'better-sqlite3')
    const postgres = resolveDev({ file: '.data/dev' }, 'postgresql', 'postgres-js')

    // Then
    expect(sqlite.connection).toBe('.data/dev.db')
    expect(postgres.connection).toBe('.data/dev')
  })

  it('lets NITRO_DRIZZLE_DEV_FILE override the configured file', () => {
    // Given / When
    const resolved = resolveDev(
      { file: '.data/configured.db' },
      'sqlite',
      'libsql',
      noEngines,
      { NITRO_DRIZZLE_DEV_FILE: '.data/from-env.db' },
    )

    // Then
    expect(resolved.connection).toBe('file:.data/from-env.db')
  })
})

describe('detectDevRuntimeEngines', () => {
  it('reads bun availability from the host process and probes node:sqlite', () => {
    // Given / When / Then
    expect(detectDevRuntimeEngines({ versions: { bun: '1.1.0' } }).bun)
      .toBe(true)
    expect(detectDevRuntimeEngines({}).bun).toBe(false)
    expect(detectDevRuntimeEngines({}).nodeSqlite).toBeTypeOf('boolean')
  })
})

describe('assertLocalDriverInstalled', () => {
  it('passes when the engine package is installed', () => {
    // Given — this repository dev-depends on @electric-sql/pglite
    // When / Then
    expect(() =>
      assertLocalDriverInstalled('pglite', process.cwd()),
    ).not.toThrow()
  })

  it('passes for built-in engines without checking packages', () => {
    // Given / When / Then
    expect(() =>
      assertLocalDriverInstalled('node-sqlite', '/definitely/not/a/project'),
    ).not.toThrow()
  })

  it('fails with an install hint when the package is missing', async () => {
    // Given
    const rootDir = await mkdtemp(join(tmpdir(), 'nitro-drizzle-dev-'))
    await writeFile(join(rootDir, 'package.json'), '{}')

    // When / Then
    expect(() =>
      assertLocalDriverInstalled('better-sqlite3', rootDir),
    ).toThrow(/better-sqlite3 dev engine requires/)
  })
})
