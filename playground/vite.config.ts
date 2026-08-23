import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'
import NitroDrizzle from '../src/vite'

export default defineConfig({
  plugins: [
    nitro(),
    NitroDrizzle(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
})
