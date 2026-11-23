# The `.kiro/` directory

Kiroween requires the repository root to contain a `/.kiro/` directory and
requires that it NOT be gitignored. In this repo `.kiro/` is tracked.

```
.kiro/
├── steering/                   # always-applied project rules
│   ├── product.md              # frozen scope, positioning, priority order
│   ├── security.md             # trust boundaries, output encoding, privacy rule
│   └── tech.md                 # stack, layout, import rules, PBT rule
└── specs/
    ├── site-core/              # data model, generator, RSS, ZIP, privacy
    │   ├── requirements.md     # EARS-style requirements + properties P1–P7
    │   ├── design.md           # design decisions and correctness properties
    │   └── tasks.md            # implementation task list (all complete)
    ├── editor/                 # mobile PWA editor
    │   ├── requirements.md     # E1–E4
    │   ├── design.md
    │   └── tasks.md
    ├── ghost/                  # visitor + owner ghost
    │   ├── requirements.md     # G1–G4
    │   ├── design.md
    │   └── tasks.md
    └── voice-capsule/          # answering machine / time capsule
        ├── requirements.md
        ├── design.md
        └── tasks.md
```

## What each piece does

- **Steering** (`inclusion: always`) is context Kiro applies to every session:
  the product scope, the security trust boundaries and the tech rules. It is how
  a multi-session build kept a consistent architecture and did not drift into
  out-of-scope features.
- **Specs** follow the requirements → design → tasks structure. Requirements are
  written as behaviours; designs name testable correctness properties; tasks
  track completion. The R1 publish service is the newest work and is documented
  in `docs/kiro-log.md` and `docs/privacy-audit.md` (the spec set above covers
  the original product; R1 extended it without new spec folders).

## License note

The repo root contains `LICENSE` (MIT), detectable by GitHub in the About
section. `.gitignore` explicitly does NOT ignore `.kiro/`.
