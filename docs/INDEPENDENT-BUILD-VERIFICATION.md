# M7b: independent clean static bundle comparison

M7a made every static asset part of a deterministic SHA256 manifest and recorded
pinned source lock hashes. M7b verifies **two independent clean source exports**
on a single CI runner produce the **same complete asset bytes**.

## CI build process

The branch-scoped gate first runs strict lint/TypeScript/unit checks, then
uses `git archive HEAD` to create two separate clean directories from the
exact tested PR head. For **each** directory it runs:

```sh
npm ci
npm run build:upstream
npm run release:prepare
npm run release:verify
(cd dist && sha256sum -c SHA256SUMS)
```

After the two builds, `node scripts/compare-releases.mjs a/dist b/dist`
verifies the complete manifests and checks that both are identical. There is
no cache of generated `dist/` files between the two builds, and the pinned
upstream clone/yarn build happens inside each exported source tree.

Any difference, missing file, symlink, unexpectedly modified file, NOTICE
change, npm lock change or stale manifest makes the comparison fail closed.
The comparison script and tests distinguish two internally consistent but
*different* releases from byte-identical releases.

## Limitations

This is reproducibility on the **same Ubuntu runner image** and under its
available Node, Corepack, build tools and network package registries; it
does **not** prove hermetic builds, cross-platform determinism, signed
provenance, immutable registries, SLSA compliance, or publisher identity.
The upstream SHA and npm lock are checked, but some upstream Yarn artifacts
can depend on resolved external packages unless frozen by upstream.

There is no authorized RC1 release license or npm publication. The provisional
NOTICE has not been audited against each bundled third-party component.
A release tag still requires manually reviewed accessibility and security
gates, npm publishing approvals and enforceable GitHub merge protections.
