# Static hosting security: CSP and browser-local imports

**M6a:** Replace the inline Allure bootstrap with `src/shell/bootstrap.mjs`, copied as a same-origin static JavaScript asset before the pinned upstream frontend bundle. The generated `index.html` includes a Content Security Policy (CSP) meta declaration for hosts like GitHub Pages, and the [Nginx configuration](../deployment/nginx.conf) sends equivalent HTTP headers.

## Policy

```text
default-src 'self'
script-src 'self'
style-src 'self' 'unsafe-inline'
img-src 'self' data: blob:
font-src 'self' data:
connect-src 'self'
media-src 'self' blob: data:
worker-src 'self' blob:
object-src 'none'
frame-src 'none'
base-uri 'self'
form-action 'none'
```

Scripts must be loaded from the site origin. The policy excludes `'unsafe-inline'` and `'unsafe-eval'` for JavaScript. `'unsafe-inline'` is allowed only for **CSS styles**, needed by the pinned Allure UI; removing that allowance requires more upstream compatibility testing. Imported test names, error messages and attachment metadata are treated as untrusted content, not executable extensions. Image and media `data:`/`blob:` sources allow local attachments without network upload.

Nginx additionally sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, a limited `Permissions-Policy`, and `X-Frame-Options: DENY`. GitHub Pages does not provide custom HTTP headers, so its CSP is **meta-enforced**; CSP `frame-ancestors`, `report-uri` and other header-only capabilities are not available through a meta tag. Do not claim equal clickjacking defense on Pages. For confidential reports, self-host using a reviewed Nginx configuration.

## Browser verification

The M6a acceptance suite builds the **original pinned Allure Awesome UI**, serves `dist/` with enforcing CSP response headers, and checks:

- generated Allure fixture import, native Allure JSON/ZIP, JUnit XML and CTRF JSON
- no inline bootstrap and a valid same-origin `bootstrap.mjs`
- matching HTML meta policy and HTTP CSP
- no report requests to external networks, no blocked runtime scripts
- real Nginx headers and static asset MIME types in a container

A CSP reduces injection impact but does **not** substitute for safe XML/JSON parsing, attachment filename handling, ZIP traversal and bomb limits, memory budgets, or browser tests. Report contents are never written to a backend by the application. If a custom build uses external analytics, fonts or an upload API, that violates the static-only project contract and requires explicit review.

## Remaining release gates

Firefox coverage, keyboard accessibility, malicious-file/performance matrices, strict MIME handling for all attachments, inline-style elimination and a full CSP review across upstream Allure updates remain open. Neither GitHub Pages nor Nginx CSP should be described as an application sandbox.
