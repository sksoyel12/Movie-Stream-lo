---
name: VPN-independent content region
description: Keep regional movie catalogs aligned with the device's selected region rather than a VPN exit IP.
---

Prefer device timezone and locale when resolving the content region; use IP geolocation only when device-local signals are unavailable.

**Why:** The user is in India and reported that a VPN made the app show the US catalog instead of Indian regional content.

**How to apply:** Keep catalog region detection independent of VPN IP when device timezone or locale identifies the region. Preserve a manual region choice if one is added later.
