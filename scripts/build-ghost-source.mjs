// Generates src/core/ghost-source.ts from src/runtime/ghost.js.
// ghost.js is the single source of truth. The generated constant lets both
// Vite (browser build) and plain Node (publish server) import the runtime with
// no Vite-only `?raw` suffix. Run: node scripts/build-ghost-source.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/runtime/ghost.js', import.meta.url), 'utf8')
const out =
  '// GENERATED FILE — do not edit. Source of truth: src/runtime/ghost.js\n' +
  '// Regenerate with: node scripts/build-ghost-source.mjs\n' +
  `export const ghostRuntime = ${JSON.stringify(source)}\n`
writeFileSync(new URL('../src/core/ghost-source.ts', import.meta.url), out)
console.log(`ghost-source.ts written (${source.length} chars)`)
