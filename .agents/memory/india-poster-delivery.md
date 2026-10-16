---
name: India poster delivery
description: Keep TMDB poster images available in India when carrier DNS blocks the direct image host.
---

TMDB poster images must load without requiring a VPN on Indian networks where `image.tmdb.org` may be DNS-blocked. This image-delivery requirement is separate from catalog-region selection.

**Why:** The user clarified that the reported problem was missing poster images while using DNS/network workarounds, not just seeing the wrong country's catalog.

**How to apply:** Put an independent image proxy before direct `image.tmdb.org` URLs, and keep catalog-region changes scoped to separate requests.
