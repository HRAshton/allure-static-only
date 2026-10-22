# M6b import accessibility and hostile ZIP regression

The report import surface now supports pointer drag-and-drop, a separate native
directory picker, a native individual-file picker, and a keyboard-operable drop target.

- Tab to the "Choose report files or drop them here" control and press Enter or
  Space to open the native individual-file picker.
- Both file inputs retain explicit labels for assistive technology; the controls
  remain visible and usable on narrow mobile screens.
- The drop target has a visible focus indicator, and import errors use an ARIA alert.
- Input and ZIP unit tests cover traversal, absolute paths, control characters,
  encrypted archives, ZIP64 and excessive declared entry counts.

Acceptance runs also check keyboard focus and picker activation in Chromium,
a 360px viewport, all existing raw-format imports and browser-only processing.

## Open RC1 accessibility/security gates

This is an import-shell improvement, **not** a claim of complete WCAG coverage.
The full upstream Allure UI still requires a keyboard and screen-reader audit,
including Firefox, responsive test details, attachment previews, cancellation
under load, and malicious-content browser checks. Browser memory and latency
budgets need measured evidence. The pinned upstream version must remain frozen
until all final release checks pass.
