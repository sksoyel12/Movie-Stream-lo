---
name: Protected source locks after imports
description: Preserve integrity checks for intentionally guarded home-feed and hero sources after repository imports.
---

After an imported repository resets file permissions, the protected-source verifier can fail even when the guarded code is otherwise correct. Restore the verifier's expected read-only modes instead of disabling its checks.

**Why:** The imported project had source files marked writable, and the app startup workflow refused to run until the protection was restored.

**How to apply:** After an import or permission reset, inspect the verifier's guarded file set, restore read-only permissions, and update only the expected hashes for source sections intentionally changed.
