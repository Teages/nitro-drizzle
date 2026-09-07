import process from 'node:process'
import { createNitro } from 'nitro/builder'

// Replaces the removed `nitro prepare` command: creating the instance runs
// module setup, which writes the generated declarations to `typesDir`.
async function prepare() {
  const nitro = await createNitro({ rootDir: process.cwd() })
  await nitro.close()
}

prepare().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
