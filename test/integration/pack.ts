import { execFile } from 'node:child_process'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// `pnpm pack` runs the prepack build, and two concurrent packs race on the
// same dist/ tree: one build's cleanup deletes files while the other's
// packlist walks them, shipping an incomplete tarball. mkdir is atomic, so a
// lock directory serializes packs across vitest's parallel integration
// workers without adding a dependency.
const LOCK_DIR = join(tmpdir(), 'nitro-drizzle-pack.lock')
const LOCK_TIMEOUT_MS = 120_000
const LOCK_POLL_MS = 250

async function acquirePackLock(): Promise<() => Promise<void>> {
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  while (!(await mkdir(LOCK_DIR).then(() => true, () => false))) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the repository pack lock.')
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
  const release = await acquirePackLock()
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
