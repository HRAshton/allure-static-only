# Contributing

Requirements: Node.js >=22.16, npm 10+. Production requires only a static HTTP server.

```sh
npm ci
npm run verify
```

`npm run check:fix` formats and fixes safe Biome issues. Keep dependency changes deliberate, with an updated lockfile and exact versions. Never disable strict compiler flags to make a PR pass.

- Use TypeScript ESM, two-space indentation, double quotes, semicolons and 100-character line width.
- Explicit types at module boundaries. Avoid `any`, unchecked type assertions, implicit non-null assertions, global mutable state and side effects on import.
- Keep types immutable. Use discriminated unions where ambiguous states could be represented.
- Include tests for success, malformed input, ambiguity and cancellation when relevant.
- Use ASCII-only fixture data when possible, redact secrets and personal information from artifacts.
- Don't hide failures or fabricate fields in converters.
- Do not add network telemetry, analytics SDKs or uploaded diagnostics.

Work on `milestone/mN-name`. Open a PR against `main` with acceptance evidence. Squash merge when checks have been verified. Batch related work into one push per milestone when practical. The source of truth for gating is [ROADMAP.md](../ROADMAP.md).
