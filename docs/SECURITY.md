# Security and privacy requirements

Imported reports are **untrusted user content**. The primary threat model includes XSS in test names and attachments, archive bombs, path traversal, oversized files, malicious formats, memory exhaustion and deceptive converter plugins.

## Required defenses before RC

- Browser-only report loading; no data uploads or telemetry.
- Render report strings as text, not executable HTML; tightly restrict attachment preview contexts.
- Bound source byte size, archive entry count, expanded ZIP size and nesting.
- Reject dangerous archive paths (absolute, traversal and inconsistent separators).
- Make cancellation work; release object URLs and workers.
- Disallow arbitrary uploaded JavaScript converters. Runtime attachable code, if supported, must come from trusted, build-approved modules and a documented trust policy.
- Limit third-party script and network origins using a Content Security Policy suitable for the upstream Allure UI.
- Use deterministic converter selection, schema validation and recognizable user-facing errors.

Security claims must be validated in browser tests; this document specifies requirements, not proof of completion. No external vulnerability reporting channel is yet established.
