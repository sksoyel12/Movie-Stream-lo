---
name: Offline playback lookup
description: The rule for opening completed downloads while catalog metadata is unavailable.
---

Completed downloads must be checked by the ID passed to the player before attempting catalog or network metadata lookups. A downloaded title can be present in local storage even when its ID is not in the static catalog.

**Why:** Offline playback must not depend on the catalog being populated or on a live network request.

**How to apply:** When changing player startup or download navigation, resolve the persisted download record from the route/movie ID first, then fall back to online playback only when no valid local file exists.