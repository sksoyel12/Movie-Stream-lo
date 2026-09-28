---
name: API server runtime recovery
description: The TMDB proxy depends on a healthy uv-managed API server environment.
---

When the API workflow reports `ModuleNotFoundError` for a package that is already declared and locked, refresh the uv lock resolution and restart the API workflow so its managed virtual environment is rebuilt.

**Why:** A stale or incomplete managed environment can make every mobile TMDB request appear to be an upstream 502 even when the proxy credentials and route are valid.

**How to apply:** Check the API workflow logs first, then verify `/api/healthz`, `/api/tmdb/config`, and one real `/api/tmdb/...` request before changing mobile fallback logic.