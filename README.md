# @teages/nitro-drizzle

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]

<!-- [![bundle][bundle-src]][bundle-href] -->
<!-- [![Codecov][codecov-src]][codecov-href] -->

> [!WARNING]
> This repository is an AI-generated MVP. It has only passed smoke-level
> validation and is not production-ready. Substantial human review, design,
> testing, security analysis, compatibility work, documentation, and ongoing
> maintenance are still required before it can be considered usable. Use it
> only for evaluation and experimentation at your own risk.

Drizzle ORM integration for Nitro v3. It generates a typed `#drizzle`
database client, prepares Drizzle Kit configuration, and manages Drizzle v1
migrations through the Drizzle Kit CLI.

## Usage

Install the module, Drizzle, and the driver used by your application:

```sh
# npm
npm install @teages/nitro-drizzle drizzle-orm drizzle-kit @libsql/client

# yarn
yarn add @teages/nitro-drizzle drizzle-orm drizzle-kit @libsql/client

# pnpm
pnpm add @teages/nitro-drizzle drizzle-orm drizzle-kit @libsql/client

# bun
bun add @teages/nitro-drizzle drizzle-orm drizzle-kit @libsql/client
```

Register the Nitro module with an explicit dialect and driver. The module does
not infer either value from environment variables. Connection credentials
live in `drizzle.connection` next to the dialect:

```ts
import NitroDrizzle from '@teages/nitro-drizzle'
import { defineConfig } from 'nitro'

export default defineConfig({
  modules: [NitroDrizzle],
  drizzle: {
    dialect: 'sqlite',
    driver: 'libsql',
    schemaPath: './server/db/schema.ts',
    connection: {
      url: 'file:.data/database.db',
    },
  },
})
```

Supported drivers:

- SQLite: `better-sqlite3`, `libsql`, `bun-sqlite`, `node-sqlite`, `d1`, `d1-http`
- PostgreSQL: `postgres-js`, `pglite`, `neon-http`
- MySQL: `mysql2`

`node-sqlite` runs on the built-in `node:sqlite` module — available on every
maintained Node version — so a SQLite application needs no database package at
all. `bun-sqlite` is its equivalent under Bun.

`drizzle.connection` values are static by default — the generated client
resolves them verbatim on first use. The module owns that resolution end to
end (connection values never pass through Nitro's `runtimeConfig`); two env
mechanisms, matching Nitro's own semantics, can replace them:

- `NITRO_DRIZZLE_CONNECTION_*` environment variables override defined keys at
  runtime (`NITRO_DRIZZLE_CONNECTION_URL`,
  `NITRO_DRIZZLE_CONNECTION_PASSWORD`, ...). Overrides cannot introduce keys
  the static connection does not define. An alternative prefix configured via
  `runtimeConfig.nitro.envPrefix` or `NITRO_ENV_PREFIX` is honored as well.
- With Nitro's `experimental.envExpansion` enabled, `{{VAR_NAME}}` templates
  in connection strings expand at runtime, so credentials never need to be in
  the config file at all:

  ```ts
  export default defineConfig({
    experimental: { envExpansion: true },
    drizzle: {
      // ...
      connection: { url: '{{DATABASE_URL}}' },
    },
  })
  ```

  Missing variables keep their literal `{{VAR_NAME}}` text. The module warns
  at startup when templates are used without env expansion enabled.

drizzle-kit commands resolve the same static values, overrides, and expansion
through `loadDrizzleConfig`, so the CLI and the running server always agree.
No connection secrets are ever baked into generated source or CLI metadata.

The database is created lazily on the first `useDrizzle()` call, except for
`d1` and Hyperdrive drivers, which resolve their Cloudflare binding from the
request context on every call.

`schemaPath` is one explicit schema entry module, resolved from the project
root. Export tables from it and, when using Drizzle v1 relations, export a
`relations` value alongside them. If that value has another name, set
`relationsExport` to its export name; the generated client still exposes it as
`relations`. The entry can re-export as many internal modules as needed; those
dependencies remain in the normal bundler graph.

```ts
const drizzle = {
  dialect: 'sqlite',
  driver: 'libsql',
  schemaPath: './server/db/schema.ts',
  relationsExport: 'appRelations',
}
```

For a project that can be built against different dialects, select exactly one
entry with a dialect map:

```ts
const drizzle = {
  dialect: 'postgresql',
  driver: 'postgres-js',
  schemaPath: {
    sqlite: './server/db/schema.sqlite.ts',
    postgresql: './server/db/schema.postgresql.ts',
    mysql: './server/db/schema.mysql.ts',
  },
}
```

A string is the convenient form for a single-dialect project. Generic and
dialect-specific entries are never combined.

Import the client from the generated `#drizzle` virtual module inside
handlers:

```ts
import { useDrizzle } from '#drizzle'

export default defineHandler(() => {
  const { db, schema, relations } = useDrizzle()
  return { db, schema, relations }
})
```

## Generated types

Run `nitro prepare`, `nitro dev`, or `nitro build`, then include the generated
declarations in the server tsconfig:

```json
{
  "extends": "nitro/tsconfig",
  "include": [
    "./**/*.ts",
    "node_modules/.nitro/drizzle/**/*.d.ts"
  ]
}
```

The module declares `#drizzle` directly. It does not add aliases or write a
synthetic package into `node_modules`.

## Migrations

Drizzle v1 migrations are generated under
`server/db/migrations/<dialect>/<timestamp>_<name>/`. Legacy
`meta/_journal.json` migrations must first be upgraded with `drizzle-kit up`.

Each project owns a single migration chain: `generate` writes to it and every
run applies it in order. Schemas compose from multiple Nitro scan directories,
but their DDL is always generated into that one chain — override its location
with `migrationsDir`. SQL for tables outside the Drizzle schema (legacy
databases, package-owned tables) belongs in the migration chain itself or in
your own runner, not in a second migration directory.

Drizzle Kit commands run against a config that `loadDrizzleConfig` builds
from your Nitro config at runtime, resolving the connection with the same
code path the server uses and pointing the schema straight at your source
files, so it is always current. Declare it from a `drizzle.config.ts` in your
project root, and drizzle-kit picks it up without a `--config` flag:

```ts
// drizzle.config.ts
import { loadDrizzleConfig } from '@teages/nitro-drizzle/config'

export default await loadDrizzleConfig()
```

```sh
drizzle-kit generate --name create-users
drizzle-kit migrate
```

Other Drizzle Kit commands (`push`, `pull`, `check`, `studio`) work the same
way. `loadDrizzleConfig` accepts a `{ cwd }` option when the project root is
not the working directory. Drizzle Kit reads the configured entry directly,
so source edits do not require re-running `nitro prepare`; it is only needed
for generated types and build artifacts. `drizzle-kit migrate` applies only
the migration chain.

Migrations never run as a side effect of a production build — the build stays
side-effect free and needs no database credentials. Apply the migration chain
in your CI/CD pipeline with `drizzle-kit migrate`, before the server starts.
During development, enable the [dev database](#dev-database) to push your
schema on startup instead.

## Dev database

`nitro dev` (and test pipelines built on the Vite dev server) can run against
a disposable local dev database instead of the configured connection — for
zero-dependency local development, a scratch database you can break freely,
and Docker-free tests:

```ts
export default defineConfig({
  modules: [NitroDrizzle],
  drizzle: {
    dialect: 'postgresql',
    driver: 'postgres-js',
    schemaPath: './server/db/schema.postgresql.ts',
    dev: true,
  },
})
```

The local engine resolves per dialect:

- PostgreSQL: `pglite` — install `@electric-sql/pglite` as a dev dependency
- SQLite: the built-in `bun:sqlite` under Bun, the built-in `node:sqlite`
  where the runtime provides it, otherwise your main driver when it is
  `better-sqlite3` or `libsql`
- MySQL: not supported

When the cascade cannot resolve (for example a `d1` main driver on a runtime
without built-in sqlite), set `drizzle.dev.driver` explicitly. The database
lives in memory by default; set `drizzle.dev.file` to persist it on disk.

On startup the module pushes the Drizzle schema with drizzle-kit — destructive
statements apply without confirmation — and requests wait until the schema is
ready. During development the explicit schema entry and everything it imports
stay in the host bundler's module graph, so the dev server reloads normally and
the dev database is re-pushed and re-seeded without a restart.

The drizzle-kit CLI always targets the real database. Switching between real
databases (local Docker, staging, branches) is a job for your `.env` files,
not for this feature.

Seed data through the `drizzle:dev:seed` runtime hook, called after every push:

```ts
// server/plugins/db-seed.ts
export default definePlugin((nitro) => {
  nitro.hooks.hook('drizzle:dev:seed', async () => {
    const { db, schema } = useDrizzle()
    // insert fixture rows — keep it idempotent
  })
})
```

To start from a clean slate, restart the dev server: in-memory databases are
recreated on startup, and for a `drizzle.dev.file` database it is enough to
delete the file before restarting.

Two environment variables control the dev database: `NITRO_DRIZZLE_DEV=false`
disables it for a single run, and `NITRO_DRIZZLE_DEV_FILE` overrides
`drizzle.dev.file`. Production builds ignore `drizzle.dev` entirely.

## Drizzle Studio

Dev-database sessions get the built-in [Drizzle Studio](https://orm.drizzle.team/drizzle-studio)
automatically: on startup the module serves a loopback proxy on a random port
and logs a `https://local.drizzle.studio?port=…` link. The web app talks to
your in-memory dev database directly — the exact same instance the dev server
runs on — with an origin check and a per-session auth key guarding the proxy.

Customize it through `drizzle.dev.studio`:

```ts
export default defineConfig({
  drizzle: {
    dialect: 'postgresql',
    schemaPath: './server/db/schema.ts',
    dev: {
      studio: {
        port: 4983, // fixed port instead of random
        silent: true, // skip the startup link
        studioUrl: 'http://localhost:5173/studio', // self-hosted Studio frontend
      },
    },
  },
})
```

`studioUrl` drives both the printed link and the origin the proxy accepts, so
pointing it at a self-hosted Studio frontend keeps the origin check intact.
Set `dev.studio: false` to disable the built-in studio; without a dev database
(`drizzle.dev`) it never starts — use `npx drizzle-kit studio` to inspect a
real connection. On the `node-sqlite` engine, array-shape Studio queries need
Node 22.16+ (`StatementSync.setReturnArrays`); older runtimes surface an
explicit error instead of silently wrong rows.

## Cloudflare

With an explicit `d1` `databaseId`, or a PostgreSQL/MySQL `hyperdriveId`, the
module adds the corresponding Wrangler binding. D1 and Hyperdrive clients are
resolved from Nitro's request context, which requires opting into
`experimental.asyncContext: true` yourself — the module refuses to enable the
experimental flag for you and fails setup with an actionable error when it is
missing.

## Development

- Clone this repository
- Install latest LTS version of [Node.js](https://nodejs.org/en/)
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable`
- Install dependencies using `pnpm install`
- Run interactive tests using `pnpm dev`

## License

Published under [MIT License](./LICENSE).

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/@teages/nitro-drizzle?style=flat&color=blue
[npm-version-href]: https://npmjs.com/package/@teages/nitro-drizzle
[npm-downloads-src]: https://img.shields.io/npm/dm/@teages/nitro-drizzle?style=flat&color=blue
[npm-downloads-href]: https://npmjs.com/package/@teages/nitro-drizzle

<!-- [codecov-src]: https://img.shields.io/codecov/c/gh/Teages/nitro-drizzle/main?style=flat&color=blue
[codecov-href]: https://codecov.io/gh/Teages/nitro-drizzle

[bundle-src]: https://img.shields.io/bundlephobia/minzip/@teages/nitro-drizzle?style=flat&color=blue
[bundle-href]: https://bundlephobia.com/result?p=@teages/nitro-drizzle -->
