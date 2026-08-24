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
database client, prepares Drizzle Kit configuration, and applies Drizzle v1
migrations during development, builds, or the `db:migrate` task.

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

Use the generated client inside handlers:

```ts
import { useDrizzle } from '@teages/nitro-drizzle/runtime'

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
in your CI/CD pipeline with `drizzle-kit migrate`, or in your deployed runtime
with the `db:migrate` task. During development, enable the
[dev database](#dev-database) to push your schema on startup instead.

The `db:migrate` task applies the migration chain. When the development server
is started by the Nitro CLI, invoke tasks through its discovery file:

```sh
nitro task run db:migrate
```

When another tool owns the development server and the discovery file is not
written, call the Nitro task endpoint directly once the server is ready:

```sh
curl -X POST http://localhost:3000/_nitro/tasks/db:migrate
curl -X POST http://localhost:3000/_nitro/tasks/db:reset
```

Use `drizzle-kit migrate` when migrations must run before the server is
available. The module enables Nitro tasks when configured; deployed runtimes
can invoke the same task through their platform integration.

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

The drizzle-kit CLI and the `db:migrate` task always target the real database.
Switching between real databases (local Docker, staging, branches) is a job
for your `.env` files, not for this feature.

Seed data through the `drizzle:dev:seed` runtime hook, called after every push
and after every reset:

```ts
// server/plugins/db-seed.ts
export default definePlugin((nitro) => {
  nitro.hooks.hook('drizzle:dev:seed', async () => {
    const { db, schema } = useDrizzle()
    // insert fixture rows — keep it idempotent
  })
})
```

The `db:reset` task drops every object, re-pushes the schema, and re-seeds.
With a Nitro CLI dev server, run:

```sh
nitro task run db:reset
```

Two environment variables control the dev database: `NITRO_DRIZZLE_DEV=false`
disables it for a single run, and `NITRO_DRIZZLE_DEV_FILE` overrides
`drizzle.dev.file`. Production builds ignore `drizzle.dev` entirely.

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
