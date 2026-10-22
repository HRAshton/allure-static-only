# RC1 release decision and single-PR engineering gate

**Target candidate**: `v0.1.0-rc.1`.
This is a *review checklist*, not an authorization to publish, tag or release.

## Engineering acceptance in this PR

- [ ] Root and SDK package metadata aligned at `0.1.0-rc.1`, both private
- [ ] Strict lint, TypeScript, converter unit tests, cancellation and size limits
- [ ] Independent npm tarball install/consumer and synthetic adapter budget
- [ ] Build pinned upstream once, verify full static SHA256 release manifest
- [ ] Two separate clean, npm-installed host source exports assemble from
      that same verified upstream asset snapshot with byte-identical output
- [ ] Real Chromium upstream Awesome import, security, hostile attachments,
      keyboard/mobile smoke and offline-after-load acceptance
- [x] Prior Firefox/browser gates passed (M6f #19 and M6e #17); upstream
      revision stays unchanged

The old double-upstream-build M7b job **failed legitimately**:
https://github.com/HRAshton/allure-static-only/actions/runs/39856522759 .
Independent builds of the pinned upstream repository produced different
hashed chunk filenames. This PR isolates deterministic host assembly to
avoid two costly upstream builds, but **does not resolve upstream build
nondeterminism** and must not be described as full end-to-end reproducibility.
Publication can use the exact verified upstream bundle and its checksums,
if the release owner formally accepts this reproducibility limitation.

## Owner-controlled release gates still open

1. **Distribution license and notices**: original project source is 0BSD,
   while pinned upstream Allure is Apache-2.0; complete the dependency-closure
   attribution review in `docs/RC1-THIRD-PARTY-LICENSE-REVIEW.md` and replace
   the provisional `NOTICE.txt` with legally complete distribution notices.
2. **npm publication**: confirm scope ownership, registry destination,
   package rights and authorized publisher; remove SDK `private: true` only
   after approval, publish, then validate a clean **registry-installed**
   consumer/host, not merely the local candidate tarball.
3. **GitHub merge enforcement**: `main` is now protected, but current
   active rulesets require unrelated Python/container contexts and CodeQL
   and block PR #24 even after the actual `source-and-reuse` checks passed.
   Replace those requirements with checks this repository actually runs;
   retain PR-only squash merges. Align human-review rules with intended
   Renovate automerge without a CI-bypassing bot exemption.
4. **Human acceptance**: complete a real screen-reader/keyboard and responsive
   upstream UI walkthrough, attachment preview checks and peak browser memory
   testing under larger user inputs; record results or expressly accept the
   remaining risks.
5. **Upstream determinism**: choose between a pinned, checksum-published
   approved asset snapshot and fixing build toolchain nondeterminism. Do
   not claim two upstream builds were bitwise reproducible.
6. **Release authorization**: confirm all above, validate the final source
   SHA against green checks and create the tag only then.

Do not make a public npm release, GitHub release or
`v0.1.0-rc.1` tag as an automatic result of a green PR. This preserves the
explicit acceptance contract in issue #12.
