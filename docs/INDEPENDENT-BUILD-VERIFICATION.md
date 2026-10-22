# RC1 build provenance and host determinism

**Observed failure of full independence:** CI
[39856522759](https://github.com/HRAshton/allure-static-only/actions/runs/39856522759)
built the *same* pinned upstream Allure revision in two separate clean worktrees
and produced different hashed JavaScript chunk filenames. Each output passed
its own SHA256 manifest integrity checks. This is an upstream chunk-emission
determinism problem, not evidence of an altered report or a successful
full independent build reproduction. It remains an explicit release risk.

## Faster and bounded acceptance

The revised M7b branch CI builds the pinned upstream **once**, verifies its
locked Git SHA, and validates a complete checksum manifest for that snapshot.
Two isolated `git archive HEAD` exports then each run independent `npm ci`,
host static shell assembly, TypeScript compilation, manifest creation and
checksum verification, consuming the **same immutable upstream frontend
snapshot**. `scripts/compare-releases.mjs` compares every file and hash and
reports the first differing entry. Existing fixture browser smoke runs against
the release shell once.

This proves reproducibility of the project's **host overlay** against a fixed
upstream asset snapshot and the integrity of that snapshot. It deliberately
does not claim deterministic generation of the upstream snapshot itself.
It takes **one upstream build**, not two, keeping Actions load down.

## Reproduce after a pinned upstream snapshot exists

```sh
npm ci
npm run verify
npm run build:upstream
npm run release:prepare
npm run release:verify
# Use two distinct clean exported host source directories:
# (cd A && npm ci && node scripts/assemble-static.mjs /ABS/PINNED/UPSTREAM/ASSETS && npm run release:prepare)
# (cd B && npm ci && node scripts/assemble-static.mjs /ABS/PINNED/UPSTREAM/ASSETS && npm run release:prepare)
node scripts/compare-releases.mjs A/dist B/dist
```

The source CLI must never assume that two builds of the pinned Allure repository
are byte-identical, and must not normalize away differing chunks to create
false reproducibility. Regenerating the pinned bundle is acceptable only with
a fresh manifest, matching revision provenance and ordinary browser/security
acceptance. For an externally distributed release, consider preserving and
reviewing the exact accepted bundle checksums rather than asserting independent
upstream reproducibility.

## RC1 authority and distribution gates

The repository version is staged at `0.1.0-rc.1` for candidate preparation,
while the SDK package remains private and **unpublished**. The provisional
NOTICE and license declaration are not a complete bill of materials or a
license grant. Before an RC1 tag or package publication, an authorized owner
must approve the project's distribution license and third-party notices,
confirm the npm scope and publishing rights, and set GitHub required status
checks/merge rules. Human assistive-technology auditing and any remaining
browser-memory/attachment decoder risks also need explicit acceptance.
