import { execFile } from 'node:child_process'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// `pnpm pack` runs the prepack build, whose cleanup deletes the dist/ tree
// before rebuilding it. Every other dist/ consumer races that window: a
// concurrent pack's packlist walk ships an incomplete tarball, and the
// sibling dev-server tests resolve the module's runtime entries from dist/
// — including on every HMR rebuild — so a mid-build cleanup fails their
// rolldown build with UNRESOLVED_IMPORT and every request answers 500.
// mkdir is atomic, so a lock directory serializes every dist/ consumer
// across vitest's parallel integration workers without adding a dependency.
const LOCK_DIR = join(tmpdir(), 'nitro-drizzle-dist.lock')
const LOCK_TIMEOUT_MS = 120_000
const LOCK_POLL_MS = 250

/**
 * Holds the repository-wide dist/ lock until the returned release runs.
 * Wrap every section that builds into dist/ (`packRepository`) or compiles
 * against its output (the `nitro dev`/`nitro build` tests) for the whole
 * lifetime of the consuming process — HMR rebuilds re-resolve dist/ at any
 * point while a dev server is alive.
 */
export async function acquireDistLock(): Promise<() => Promise<void>> {
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  while (!(await mkdir(LOCK_DIR).then(() => true, () => false))) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the repository dist lock.')
    }
    await new Promise(resolve => setTimeout(resolve, LOCK_POLL_MS))
  }
  return () => rm(LOCK_DIR, { recursive: true, force: true })
}

/**
 * Packs the repository tarball (prepack build included) into `destination`
 * and returns the tarball path. Always pack through this helper: the lock
 * keeps parallel test files from racing on the shared dist/ output.
 */
export async function packRepository(destination: string): Promise<string> {
  const release = await acquireDistLock()
  try {
    await execFileAsync('pnpm', [`pack`, `--pack-destination=${destination}`], {
      cwd: process.cwd(),
    })
    const [tarball] = (await readdir(destination)).filter(file => file.endsWith('.tgz'))
    if (tarball === undefined) {
      throw new Error('pnpm pack did not create a tarball.')
    }
    return join(destination, tarball)
  }
  finally {
    await release()
  }
}
