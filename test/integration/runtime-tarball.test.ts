import type { AddressInfo } from 'node:net'
import { execFile, spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { copyFixture } from './fixtures'
import { packRepository } from './pack'

const execFileAsync = promisify(execFile)
const repoRoot = process.cwd()
const temporaryDirectories: string[] = []
const childProcesses: ReturnType<typeof spawn>[] = []

afterEach(async () => {
  for (const child of childProcesses.splice(0)) {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      await new Promise<void>(resolve => child.once('exit', () => resolve()))
    }
  }
  await Promise.all(
    temporaryDirectories.splice(0).map(path =>
      rm(path, { recursive: true, force: true }),
    ),
  )
})

async function reservePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}

async function waitForJson(url: string, output: () => string): Promise<unknown> {
  const deadline = Date.now() + 90_000
  let lastError: unknown = new Error(`Timed out waiting for ${url}`)
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return await response.json()
      }
      lastError = new Error(`${url} responded with HTTP ${response.status}`)
    }
    catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`${String(lastError)}\n${output()}`)
}

async function waitForStatus(url: string, status: number, output: () => string): Promise<void> {
  const deadline = Date.now() + 90_000
  let lastError: unknown = new Error(`Timed out waiting for ${url} to answer HTTP ${status}`)
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.status === status) {
        return
      }
      lastError = new Error(`${url} responded with HTTP ${response.status}`)
    }
    catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`${String(lastError)}\n${output()}`)
}

async function stop(child: ReturnType<typeof spawn>): Promise<void> {
  const index = childProcesses.indexOf(child)
  if (index !== -1) {
    childProcesses.splice(index, 1)
  }
  if (child.exitCode !== null) {
    return
  }
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  child.kill('SIGTERM')
  await Promise.race([
    exited,
    new Promise<void>(resolve => setTimeout(resolve, 10_000)),
  ])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
  }
  await exited
}

async function startNitroDev(
  rootDir: string,
  port: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ child: ReturnType<typeof spawn>, output: () => string }> {
  const nitroBin = join(rootDir, 'node_modules/.bin/nitro')
  let logs = ''
  const child = spawn(
    nitroBin,
    ['dev', '--host', '127.0.0.1', '--port', String(port)],
    { cwd: rootDir, env, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  childProcesses.push(child)
  child.stdout?.on('data', chunk => logs += String(chunk))
  child.stderr?.on('data', chunk => logs += String(chunk))
  return { child, output: () => logs }
}

describe('published runtime entries in Nitro dev', () => {
  it('resolves app virtuals inside the installed package', { timeout: 600_000 }, async () => {
    // Given an isolated consumer installed from the actual package tarball,
    // running the base fixture app against it
    const rootDir = await mkdtemp(join(tmpdir(), 'nitro-drizzle-runtime-tarball-'))
    temporaryDirectories.push(rootDir)
    const tarball = await packRepository(rootDir)
    const packageDir = join(rootDir, 'node_modules/@teages/nitro-drizzle')
    await mkdir(packageDir, { recursive: true })
    await execFileAsync(
      'tar',
      ['-xzf', tarball, '-C', packageDir, '--strip-components=1'],
    )
    // Every obuild entry ships a file: obuild mirrors src/ paths into dist/,
    // so an entry pointing at a moved-away source silently drops its output.
    for (const entry of [
      'index',
      'config',
      'runtime/configuration/connection',
      'runtime/configuration/env',
      'runtime/plugins/drizzle',
      'runtime/middleware/studio-gate',
      'runtime/routes/_drizzle/studio',
    ]) {
      await access(join(packageDir, 'dist', `${entry}.mjs`))
    }
    await copyFixture(rootDir, { moduleSpecifier: '@teages/nitro-drizzle' })
    for (const dependency of [
      'drizzle-kit',
      'drizzle-orm',
      'nitro',
      'rolldown',
    ]) {
      await symlink(
        join(repoRoot, 'node_modules', dependency),
        join(rootDir, 'node_modules', dependency),
        'dir',
      )
    }
    await mkdir(join(rootDir, 'node_modules/.bin'), { recursive: true })
    await symlink(
      join(repoRoot, 'node_modules/.bin/nitro'),
      join(rootDir, 'node_modules/.bin/nitro'),
      'file',
    )
    // The fixture seeds one row through the dev database, so the first served
    // count proves the whole chain: installed runtime, dev database, schema
    // push, and the app's seed hook.

    // When Nitro dev starts from the installed package, with the config hook
    // redirecting the dev database at a probe file
    const devPort = await reservePort()
    const probeFile = join(rootDir, 'config-hook.db')
    const dev = await startNitroDev(rootDir, devPort, {
      ...process.env,
      DEV_MOCK_DATABASE_FILE: probeFile,
    })
    await expect(
      waitForJson(`http://127.0.0.1:${devPort}/api/count`, dev.output),
    ).resolves.toEqual({ count: 1 })
    // And the dev database exposes itself through mockDb as the same
    // instance as db
    await expect(
      waitForJson(`http://127.0.0.1:${devPort}/api/mock-db`, dev.output),
    ).resolves.toEqual({ mocked: true, same: true })
    // And the setup hook ran against that same dev database before the push
    await expect(
      waitForJson(`http://127.0.0.1:${devPort}/api/setup`, dev.output),
    ).resolves.toEqual({ userVersion: 42 })
    // And the rewritten connection took effect: the probe file carries the
    // pushed schema and the setup marker
    const probe = new Database(probeFile)
    try {
      expect(
        probe.prepare('SELECT name FROM sqlite_master WHERE type = \'table\' AND name = \'counts\'').all(),
      ).toHaveLength(1)
      expect(probe.prepare('PRAGMA user_version').get()).toEqual({ user_version: 42 })
    }
    finally {
      probe.close()
    }

    // Then #drizzle resolves inside the consumer graph
    const devBundle = await readFile(
      join(rootDir, '.nitro/dev/index.mjs'),
      'utf8',
    )
    expect(devBundle).not.toMatch(/from\s+["']#drizzle["']/)
    await stop(dev.child)

    // And a failed config hook fails requests instead of routing into
    // handlers with an uninitialized client: Nitro swallows request-hook
    // rejections, so the ready-gate middleware is what turns the failure
    // into a 500
    const failPort = await reservePort()
    const failing = await startNitroDev(rootDir, failPort, {
      ...process.env,
      DEV_MOCK_CONFIG_FAIL: '1',
    })
    try {
      await expect(
        waitForStatus(`http://127.0.0.1:${failPort}/api/count`, 500, failing.output),
      ).resolves.toBeUndefined()
    }
    finally {
      await stop(failing.child)
    }
  })
})
