import antfu from '@antfu/eslint-config'

export default antfu(
  {
    gitignore: { recursive: true },
  },
  // Domain-slice dependency boundaries. The rules match the import specifier
  // text, so they speak the same relative paths the sources write. Each src/
  // file class is owned by exactly one config — later flat configs override
  // the same rule for the same file, so the classes must not overlap. Tests
  // and the playground are unbounded.
  // Server slices: own domain + contracts only. no-restricted-imports cannot
  // express "every domain except my own" in one shared config, so each slice
  // with a runtime tree gets its own entry that bans every other domain.
  ...(['configuration', 'dev-database', 'studio'] as const).map(slice => ({
    name: `domain-boundaries/runtime-code/${slice}`,
    files: [`src/${slice}/runtime/**/*.ts`],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: [
            '**/nitro-module/**',
            '**/cloudflare/**',
            '**/schema-artifacts/**',
            '**/virtual-client/**',
            '**/database/**',
            ...(['configuration', 'dev-database', 'studio'] as const)
              .filter(other => other !== slice)
              .map(other => `**/${other}/**`),
          ],
          message: 'Server slices may only import their own domain and contracts.',
        }],
      }],
    },
  })),
  {
    // Cross-domain vocabulary: zero internal dependencies.
    name: 'domain-boundaries/contracts',
    files: ['src/contracts/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/configuration/**', '**/database/**', '**/dev-database/**', '**/studio/**', '**/cloudflare/**', '**/virtual-client/**', '**/schema-artifacts/**', '**/nitro-module/**'],
          message: 'contracts/ has zero internal dependencies.',
        }],
      }],
    },
  },
  {
    // Domain implementations: build-time only, and never the composition root.
    name: 'domain-boundaries/node-code',
    files: ['src/**/*.ts', 'src/**/*.d.ts'],
    ignores: ['src/contracts/**', 'src/*/runtime/**', 'src/index.ts', 'src/config/loader.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/runtime/**', '**/nitro-module/**'],
          message: 'Domain code is build-time only and must not import server slices or the composition root; move shared pieces into contracts.',
        }],
      }],
    },
  },
  {
    // ABI facades: entry points may reach the composition root, nothing else
    // beyond contracts.
    name: 'domain-boundaries/facades',
    files: ['src/index.ts', 'src/config/loader.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/runtime/**'],
          message: 'The facade must stay a pure re-export; register runtime entries through the module instead.',
        }],
      }],
    },
  },
)
