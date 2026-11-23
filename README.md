# Little Internet

**Your corner of the internet. Yours to keep.**

A mobile-first personal website creator for Kiroween 2026 (Resurrection category).
Arrange a homepage on a snap grid, write posts, add photos, adopt a small website ghost,
link to other personal sites, publish, and export the whole site as static files that run
on any static host — without this platform.

> Work in progress. See `.kiro/specs/` for specs and `.kiro/steering/` for project rules.

## Development

```bash
npm install
npm test        # unit + property-based tests (single run)
npm run build
```

## License

MIT — see [LICENSE](./LICENSE).

## Checks

```bash
npm test         # unit + property-based tests
npm run e2e      # builds, serves, and drives the full chain in headless Chromium
                 # (first time: npx playwright install chromium-headless-shell)
```
