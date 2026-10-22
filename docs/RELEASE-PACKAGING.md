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
The project and SDK candidates are both versioned `0.1.0-rc.1` and remain
private. The consolidated gate compares two clean host assembles consuming
one verified pinned upstream asset snapshot; independently rebuilding that
upstream source has **already produced different hashed chunk filenames**.
See `docs/INDEPENDENT-BUILD-VERIFICATION.md` before claiming reproducibility.

The NOTICE is provisional. Generated `third-party-license-files.json`
indexes and hashes the bundler-emitted `*.LICENSE.txt` companion files;
it is not a comprehensive license inventory or a grant of rights.
Original project code is now approved under 0BSD, and pinned Allure is
Apache-2.0. This alone does not clear the actual upstream bundle:
`docs/RC1-THIRD-PARTY-LICENSE-REVIEW.md` inventories observed bundled
license comments and open redistribution obligations. Do not issue a release
tag based on this milestone alone.
