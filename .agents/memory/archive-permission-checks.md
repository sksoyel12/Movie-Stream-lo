---
name: Archive permission checks
description: Permission-sensitive integrity checks in imported repositories
---

When importing a repository through an archive or file-copy step, verify that files intended to be read-only retain their mode before treating a verification failure as a source-code change.

**Why:** Archive extraction commonly restores file contents but not permission bits, while some repositories intentionally use read-only files as part of their integrity guard.

**How to apply:** If an imported project's preflight check reports a protected file is writable, inspect the repository's expected mode and restore only that file permission before rerunning the check.