# M6c: Chromium, Firefox and adversarial report acceptance

The pinned upstream Allure Awesome UI must load an actual report in both Chromium
and Firefox using a **single production static build**. The shared browser smoke
runs against an HTTP static-file test server with enforcing CSP headers and meta
CSP. No browser-specific frontend fork or runtime API is allowed.

## Acceptance commands

After the normal clean checkout `npm ci`, pinned upstream build and fixture setup:

```sh
CHROME_BIN=/usr/bin/google-chrome node scripts/smoke-browser.mjs
# From the pinned upstream Yarn workspace, install its matched Playwright Firefox:
(cd .allure-workspace/upstream && corepack yarn playwright install --with-deps firefox)
BROWSER_ENGINE=firefox node scripts/smoke-browser.mjs
```

The shared smoke checks the upstream UI, generated Awesome, native Allure JSON
and ZIP, screenshot/retry/step fidelity, JUnit and CTRF mappings, keyboard file
selection, narrow importer layout, CSP, an HTML-looking JUnit test name and no
off-origin report requests. The HTML-looking name must render as **text** rather
than an injected HTML element or executed event handler.

Browser versions are defined by the pinned upstream Playwright installation
for Firefox and the CI runner's Chrome binary. Record the actual CI run and
browser versions when accepting the PR. Browser engine compatibility is tied
to the frozen upstream commit, not a general promise of evergreen compatibility.

## Limits not discharged by M6c

This is smoke and targeted injection coverage, not a full penetration test,
screen-reader certification, offline cache guarantee or sustained-load test.
Attachment preview isolation, malicious binary cases, cancellation under large
loads, mobile upstream report detail accessibility and quantitative performance
budgets still require separate release gates. The app remains static and all
report parsing happens locally in the browser.
