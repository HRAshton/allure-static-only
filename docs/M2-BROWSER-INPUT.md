# M2 browser-local file input

Browser File ports validate relative paths, duplicates and file/total byte limits. Cancellation is checked at each asynchronous boundary. Converter detection remains independent of the UI.

The actual static Allure shell now supports drag/drop, multiple files, a directory picker, cancel, progress, and visible errors. The import of a generated Awesome report stays in memory. No runtime upload, API, database or server is used. The original upstream Allure UI is preserved.

The Chrome smoke first drops invalid data and checks a useful error, then loads a generated directory and verifies Allure renders the passing test without external requests.

Limitations: M2 still consumes generated Awesome data, not raw allure-results. Dropping loose files may omit folder structure; the directory picker preserves it. Cancellation is cooperative, not interruption of an in-flight arrayBuffer. ZIP decompression and worker parsing are later milestones.
