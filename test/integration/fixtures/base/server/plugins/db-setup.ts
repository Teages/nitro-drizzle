import process from 'node:process'
import { definePlugin } from 'nitro'

export default definePlugin((nitro) => {
  nitro.hooks.hook('drizzle:config', async (config) => {
    // Redirect construction at a file chosen by the test harness, proving
    // the rewritten connection reaches the engine.
    const file = process.env.DEV_MOCK_DATABASE_FILE
    if (file) {
      config.connection = file
    }
  })

  nitro.hooks.hook('drizzle:dev-mock:setup', async (client) => {
    // Enable an engine capability before the schema push: the version marker
    // proves the setup hook ran against the dev database itself.
    client.exec('PRAGMA user_version = 42')
  })
})
