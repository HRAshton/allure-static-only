# M6f: attachment preview type isolation

Allure results are untrusted test artifacts. A result JSON may assert an
arbitrary attachment `type`, and its `source` filename can have a different
extension. Neither should be used alone to opt into a browser preview.

## Static adapter rule

The Allure Awesome adapter allows preview metadata only when an attachment
has an explicitly supported and **matching** extension/MIME pair: PNG, JPEG,
WebP, plain text, or JSON. The default for any mismatch or unsupported
format, including HTML, SVG, JavaScript and executable extensions, is
`application/octet-stream` with **no output preview extension**.

The original, unmodified filename remains in `originalFileName` for
download identification. The mapping between an untrusted source path and
the generated safe `data/attachments/attachment-N[.ext]` asset is stable,
and the output is still encoded in memory, never uploaded to the host.

## Acceptance

The unit suite tests actual adapter metadata and generated asset paths for
SVG, HTML with spoofed PNG MIME, JavaScript, PNG with spoofed HTML MIME,
and supported PNG/text.

The real pinned Allure Awesome browser smoke in **Chromium and Firefox**
uploads a JSON result together with an SVG script payload and an HTML script
payload mislabeled as PNG by the result metadata. The smoke verifies:

- the original UI renders the test suite;
- neither hostile attachment receives a preview-capable type or extension;
- both binary byte payloads remain unchanged and scoped to generated IDs;
- there is no script execution, active injected DOM or off-origin request;
- the rest of the existing browser, CSP, keyboard/mobile, offline and
  fixture suite still passes.

This does not prove malicious binaries cannot exploit a browser decoder,
that every upstream attachment modal and route is safe, or complete manual
screen-reader/keyboard conformance. We do **not** sniff the file signature,
and ZIP/binary memory peaks require separate testing.

## Reproduce

```sh
npm ci
npm run verify
npm run bench:import
npm run build:upstream
node scripts/prepare-fixture.mjs
node scripts/prepare-m3-fixture.mjs
(cd .allure-workspace/m1-fixture-results && zip -q ../m3-fixture.zip *-result.json)
(cd .allure-workspace/m3-complex-results && zip -q ../m3-complex.zip *)
CHROME_BIN=/usr/bin/google-chrome node scripts/smoke-browser.mjs
node scripts/install-firefox.mjs
BROWSER_ENGINE=firefox node scripts/smoke-browser.mjs
```

The security posture for confidential reports remains self-hosted Nginx
with reviewed CSP headers. GitHub Pages only supports meta-enforced CSP,
and upstream inline CSS still requires `style-src 'unsafe-inline'`.
