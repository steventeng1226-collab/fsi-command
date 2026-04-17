import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/fsi-command/',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
})
