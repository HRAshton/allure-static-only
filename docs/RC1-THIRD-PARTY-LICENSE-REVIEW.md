# RC1 third-party license evidence (not legal clearance)

**Scope:** GitHub Pages bundle built from `main`
`4d0de86f6f5ebaaea19d227d67d401175b9a74d0`, run
[39863736810](https://github.com/HRAshton/allure-static-only/actions/runs/39863736810),
artifact ID `12463515855`, artifact digest
`sha256:de85d3c4fab41b62b132cd5294ebc1bc9882989dd75703cf8d5c38193fc30268`.
The artifact was inspected as the ZIP's embedded `artifact.tar`.

This is a **factual inventory of license declarations in the emitted bundle**,
not a complete dependency closure, verified license compatibility review, or
authorization to redistribute/publish. Snapshot inspection does not replace
review of the upstream resolved Yarn dependency graph and asset generators.

## What the shipped bundle actually contained

- 135 regular static files and five `*.js.LICENSE.txt` companion files.
- `app-49661bb2df337fcb1eff.js.LICENSE.txt`: DOMPurify 3.4.16
  (dual Apache-2.0 / MPL-2.0), regenerator-runtime (MIT), filesize 10.1.6
  (BSD-3-Clause).
- `8936-2b9b44762e789974fef6.js.LICENSE.txt`: a Thenable implementation
  (MIT), a Bézier curve generator (MIT), and Runge–Kutta spring code (MIT).
- `attachment-markdown-791186815fe10876f454.js.LICENSE.txt`:
  markdown-it 15.0.3 (MIT).
- `3210-1ee9f54709a0af7d4661.js.LICENSE.txt`:
  Sortable 1.15.7 (MIT).
- `8163-ae044612458829f0ce9b.js.LICENSE.txt`:
  Prism (MIT).

The original build **did not ship** `NOTICE.txt`,
`LICENSES/0BSD.txt`, `LICENSES/Apache-2.0.txt`,
`third-party-license-files.json`, `provenance.json`, or `SHA256SUMS`.
[PR #24](https://github.com/HRAshton/allure-static-only/pull/24)
adds these files to the Pages packaging step, and validates checksums before
upload. Its changes must pass the protected branch's genuine required CI and
be squash-merged before this gap can be described as fixed in production.

## Work required before a distribution sign-off

1. Produce a complete list of the **resolved upstream production dependency
   closure**, not just packages with emitted webpack notice comments;
   include third-party assets such as fonts, icons, images and their licenses.
2. For each redistributed component, record exact version, package origin,
   SPDX expression and which copyright/license/NOTICE materials its license
   requires to accompany the output.
3. Obtain and preserve the correct **full texts and notices** for MIT,
   BSD-3-Clause, Apache-2.0 and any other licenses in the actual closure.
   The DOMPurify dual-license declaration must be reviewed against the
   distribution's chosen applicable terms. Do not label upstream as 0BSD.
4. Add reviewed license/NOTICE files to the release packaging, checksum
   them, and independently inspect the **new** Pages/Nginx release artifact.
5. Record the final legal review/owner approval in issue #12 before a
   GitHub release, public registry publication, or RC1 tag.

**Distinguish audits:** `reuse lint` covers the source repository's
copyright/license annotations. It does **not** audit resolved Yarn/npm
transitive dependencies or third-party assets bundled in Allure.
