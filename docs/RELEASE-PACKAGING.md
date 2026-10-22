# M7a: clean static release packaging gate

The release candidate requires a reproducible *process*, a pinned Allure
upstream commit, and byte-level checksums for every shipped static asset.

## Commands

On a clean checkout with Node.js 22.16+ and the normal upstream tools:

```sh
npm ci
npm run verify
npm run build:upstream
npm run release:prepare
npm run release:verify
(cd dist && sha256sum -c SHA256SUMS)
```

The pinned Allure build now clears `dist/` before copying upstream assets to
avoid carrying stale files forward. This is intentionally a build-time
operation, not a runtime server. Generated `dist/SHA256SUMS` covers all
assets, including the provisional `NOTICE.txt` and lockfile-based
`provenance.json`; it excludes itself. Checks are sorted, stable, and reject
missing, extra, modified or symlinked files. No current time, runner identity
or secret is added to the provenance.

The release uses only HTML, CSS, JS and static files served by Nginx. An Nginx
smoke should verify CSP and `nosniff`, correct JavaScript MIME, and that the
checksum and attribution artifacts can be served unchanged.

## Boundaries / remaining blockers

Checksums prove self-consistency of a distribution after it has been prepared;
they are **not a cryptographic signature** or supply-chain attestation.
The version in `package.json` is still `0.0.0`, and the SDK package remains
private. Reproducing an identical bundle in a *separate clean build* and
recording asset provenance for the complete upstream dependency tree still
needs evidence.

The NOTICE is provisional. No project-wide LICENSE has been approved, and
the dependencies actually bundled by the upstream frontend require review
before publication. Do not issue a release tag based on this milestone alone.
