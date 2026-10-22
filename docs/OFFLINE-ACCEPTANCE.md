# M6e: offline-after-load local imports

Once the static shell and preapproved converter modules finish their first
network load, imported reports must remain fully local when the browser goes
offline. The browser now **preloads the trusted converter module graph** from
the same static origin at startup; it does not import arbitrary report-supplied
JavaScript, transmit report files, use a backend, or change the pinned Allure
UI.

## Acceptance gate

A single production `dist/` build is served from a local HTTP static host.
Both Chromium and Firefox exercise, in separate fresh browser contexts:

1. Navigate while online and wait until the shell is network-idle.
2. Switch the entire browser context to offline mode.
3. Import an actual generated Awesome report directory, then a JUnit XML file.
4. Assert that the original upstream UI displays the expected suite and
   report counts, with no failed network requests or JavaScript errors.

The same acceptance also runs the standard native Allure JSON/ZIP, attachments,
retries, JUnit/CTRF, malicious-name, CSP, keyboard and mobile browser smoke.

## Reproduction

```sh
npm ci
npm run verify
npm run build:upstream
node scripts/prepare-fixture.mjs
node scripts/prepare-m3-fixture.mjs
(cd .allure-workspace/m1-fixture-results && zip -q ../m3-fixture.zip *-result.json)
(cd .allure-workspace/m3-complex-results && zip -q ../m3-complex.zip *)
CHROME_BIN=/usr/bin/google-chrome node scripts/smoke-browser.mjs
node scripts/install-firefox.mjs
BROWSER_ENGINE=firefox node scripts/smoke-browser.mjs
```

**Limitations:** Offline-after-load is not the same as a cold-start offline
application. A new navigation without network requires explicit caching and
is not promised by this browser-only, Nginx-served static site. Existing
Allure upstream routes or attachment previews may lazily load other resources
after navigating, so this smoke does not certify every route offline. A full
assistive-technology and hostile attachment audit remains an RC1 gate.
