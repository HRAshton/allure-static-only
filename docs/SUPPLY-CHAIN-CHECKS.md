# Source licensing and dependency automation

## REUSE / https://api.reuse.software/

The project source, examples, tests and build scripts are licensed under
**0BSD**, with machine-readable metadata in `REUSE.toml`. `LICENSES/0BSD.txt`
is the complete project license. The pinned upstream Allure Awesome frontend
remains **Apache-2.0**, with its exact pinned `LICENSE.txt` mirrored to
`LICENSES/Apache-2.0.txt`. Static distributions include both texts with
checksums. No upstream code is relicensed.

Every pull request receives a **lightweight REUSE lint** via the pinned official
REUSE action; the action checks repository source metadata and license texts,
not the externally generated upstream/Yarn artifact tree. To enable the
**hosted live API** and badge, a repository owner must manually register
`https://github.com/HRAshton/allure-static-only` at
https://api.reuse.software/ and verify the service's email confirmation.
The hosted service checks only `main`, so the PR lint is the authoritative
premerge check. After registration the endpoint will be
https://api.reuse.software/info/github.com/HRAshton/allure-static-only
and the badge can use
https://api.reuse.software/badge/github.com/HRAshton/allure-static-only .
No account, email or token is committed.

REUSE metadata is not a third-party **software bill of materials** or a
substitute for checking the attribution requirements of every upstream
dependency. The included NOTICE remains provisional pending that audit.

## OpenSSF Scorecard

A weekly **Tuesday 09:27 UTC** GitHub Action runs the official pinned
Scorecard action with read-only checkout and narrowly scoped publishing /
SARIF upload permissions. It publishes public results with GitHub OIDC and
uploads findings to GitHub's Security > Code scanning. An authorized
maintainer can also invoke the workflow manually to get an initial reading.
Public status: https://scorecard.dev/viewer/?uri=github.com/HRAshton/allure-static-only .

## Renovate grouped updates and automerge

Enable the **Renovate GitHub App** for this repository. Configuration
`.github/renovate.json` requests one weekly maintenance window on
**Monday 02:00–05:59 Europe/Belgrade**, capped at two concurrent PRs:
a grouped non-major batch (patch/minor/pin/digest) eligible for squash
automerge after green status checks, and a grouped major batch requiring
manual review. npm releases are given three days to stabilize.

`platformAutomerge=false` disables GitHub's native auto-merge shortcut;
Renovate must itself observe green checks. We never use branch automerge
or bypass PR review. The lightweight `source-and-reuse` check is designed
to keep grouped Renovate PRs fast without rebuilding upstream Allure.

**Repository administrator action is still essential:** configure a branch
ruleset on `main` requiring PRs and `source-and-reuse` as a status check,
allow squash merges, and grant the Renovate App appropriate PR-merge
permissions. Until both the App and that ruleset are active, a configuration
file cannot guarantee Renovate scheduling, automerge, or gated merges.
No automatic dependency PRs should trigger an npm publication or RC1 tag.
