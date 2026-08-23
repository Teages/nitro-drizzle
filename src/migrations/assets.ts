import type { Dirent } from 'node:fs'
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  realpath,
  rm,
} from 'node:fs/promises'
import { cwd } from 'node:process'
// pathe keeps relative paths forward-slashed on every host, so the
// `/migration.sql` and `/snapshot.json` suffix filters below also match
// on Windows where node:path would emit backslash separators.
import {
  dirname,
  join,
  parse,
  relative,
  resolve,
} from 'pathe'

interface CopyAssetsOptions {
  readonly destinationDir: string
  readonly trustedDestinationRoot?: string
}

export interface CollectMigrationAssetsOptions extends CopyAssetsOptions {
  /**
   * The single Drizzle migration chain directory to collect from.
   */
  readonly sourceDir: string
}

export class AssetCopyError extends Error {
  readonly code = 'unsafe_destination'

  constructor(readonly destinationDir: string) {
    super(`Refusing to replace unsafe database asset destination: ${destinationDir}`)
    this.name = 'AssetCopyError'
  }
}

export class AssetSymlinkError extends Error {
  readonly code = 'symlink_not_allowed'

  constructor(readonly path: string) {
    super(`Symbolic links are not allowed in database assets: ${path}`)
    this.name = 'AssetSymlinkError'
  }
}

interface AssetFile {
  readonly absolutePath: string
  readonly relativePath: string
}

function isMissingPath(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT'
}

async function readDirectory(directory: string): Promise<Dirent[]> {
  try {
    return await readdir(directory, { withFileTypes: true })
  }
  catch (error) {
    if (isMissingPath(error)) {
      return []
    }
    throw error
  }
}

async function listFiles(root: string, directory = root): Promise<AssetFile[]> {
  let metadata
  try {
    metadata = await lstat(directory)
  }
  catch (error) {
    if (isMissingPath(error)) {
      return []
    }
    throw error
  }
  if (metadata.isSymbolicLink()) {
    throw new AssetSymlinkError(directory)
  }
  const entries = await readDirectory(directory)
  entries.sort((left, right) => left.name.localeCompare(right.name))
  const files: AssetFile[] = []

  for (const entry of entries) {
    if (entry.name === '.DS_Store') {
      continue
    }

    const absolutePath = join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      throw new AssetSymlinkError(absolutePath)
    }
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, absolutePath))
    }
    else if (entry.isFile()) {
      files.push({
        absolutePath,
        relativePath: relative(root, absolutePath),
      })
    }
  }
  return files
}

function isContained(root: string, candidate: string): boolean {
  const path = relative(root, candidate)
  return path === '' || (!path.startsWith('..') && !parse(path).root)
}

async function resetDestination(
  destinationDir: string,
  trustedDestinationRoot?: string,
): Promise<void> {
  const absoluteDestination = resolve(destinationDir)
  if (
    absoluteDestination === parse(absoluteDestination).root
    || absoluteDestination === resolve(cwd())
  ) {
    throw new AssetCopyError(destinationDir)
  }
  const absoluteTrustedRoot = trustedDestinationRoot === undefined
    ? undefined
    : resolve(trustedDestinationRoot)
  if (
    absoluteTrustedRoot !== undefined
    && !isContained(absoluteTrustedRoot, absoluteDestination)
  ) {
    throw new AssetCopyError(destinationDir)
  }
  let current = absoluteDestination
  while (current !== parse(current).root) {
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new AssetSymlinkError(current)
      }
      if (absoluteTrustedRoot !== undefined) {
        const [canonicalRoot, canonicalCurrent] = await Promise.all([
          realpath(absoluteTrustedRoot),
          realpath(current),
        ])
        if (!isContained(canonicalRoot, canonicalCurrent)) {
          throw new AssetCopyError(destinationDir)
        }
      }
      break
    }
    catch (error) {
      if (!isMissingPath(error)) {
        throw error
      }
    }
    current = dirname(current)
  }
  await rm(absoluteDestination, { recursive: true, force: true })
  await mkdir(absoluteDestination, { recursive: true })
}

async function copyAssets(
  assets: readonly AssetFile[],
  destinationDir: string,
  copied: Set<string>,
): Promise<void> {
  for (const asset of assets) {
    if (copied.has(asset.relativePath)) {
      continue
    }
    const destination = join(destinationDir, asset.relativePath)
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(asset.absolutePath, destination)
    copied.add(asset.relativePath)
  }
}

export async function collectMigrationAssets(
  options: CollectMigrationAssetsOptions,
): Promise<string[]> {
  await resetDestination(
    options.destinationDir,
    options.trustedDestinationRoot,
  )
  const assets = (await listFiles(options.sourceDir)).filter(asset =>
    asset.relativePath.endsWith('/migration.sql')
    || asset.relativePath.endsWith('/snapshot.json'),
  )
  const copied = new Set<string>()
  await copyAssets(assets, options.destinationDir, copied)
  return [...copied]
}
