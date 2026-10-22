# M6d: cancellation and synthetic adapter budgets

The importer now checks cancellation after loading lazy converter modules and
after archive expansion, before converter selection or conversion is executed.
This closes an unnecessary-work window; it does not add a browser Worker.

Run the strict test gate and the deterministic large-report benchmark:

```sh
npm ci
npm run verify
npm run bench:import
```

The benchmark validates and adapts **1,800 synthetic tests** across 12 suites,
serializes the resulting static Allure documents and records execution time,
incremental Node heap and serialized bytes. Its **15-second** wall-clock and
**192 MiB** incremental heap ceilings are broad regression tripwires, not
typical browser latency, maximum browser RSS or a comprehensive stress test.

Before RC1, follow up with a separate PR proving true offline-after-load
imports in Chromium and Firefox, attachment memory isolation and screen reader
inspection; these are not discharged by this benchmark. Dynamic trusted
converter loading still requires a build-approved module source, not uploaded
JavaScript.
