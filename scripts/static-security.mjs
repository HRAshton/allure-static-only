/**
 * Conservative static-site CSP: no inline JavaScript, eval, off-origin network access or untrusted plugins.
 * Inline CSS remains permitted for the pinned upstream Allure Awesome runtime styles.
 * GitHub Pages cannot supply HTTP response headers; the index uses an equivalent
 * CSP meta policy. Nginx adds server headers in deployment/nginx.conf.
 */
export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data:; media-src 'self' blob: data:; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'";

export const STATIC_SECURITY_HEADERS = Object.freeze({
  "content-security-policy": CONTENT_SECURITY_POLICY,
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
});
