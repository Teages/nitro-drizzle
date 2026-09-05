import antfu from '@antfu/eslint-config'

export default antfu({
  gitignore: { recursive: true },
  ignores: [
    'test/integration/fixtures/**/migrations/**/snapshot.json',
  ],
})
