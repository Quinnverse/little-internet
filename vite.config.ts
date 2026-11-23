import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'

export default defineConfig({
  // Relative base so the editor works from any path on any static host.
  base: './',
  plugins: [preact()],
})
