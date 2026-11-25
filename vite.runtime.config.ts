import { defineConfig } from 'vite'

// Builds the visitor runtime (3D door + room) as one self-contained script. It is committed as
// src/runtime/room.bundle.js and shipped in every exported site as room.js.
export default defineConfig({
  publicDir: false,
  build: {
    lib: { entry: 'src/runtime/room-entry.ts', formats: ['iife'], name: 'LittleInternetRoom', fileName: () => 'room.bundle.js' },
    outDir: 'src/runtime',
    emptyOutDir: false,
    minify: true,
    target: 'es2020',
    reportCompressedSize: true,
  },
})
