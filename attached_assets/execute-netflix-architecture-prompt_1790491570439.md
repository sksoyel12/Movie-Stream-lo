Execute the complete Netflix architecture specification from `netflix-architecture-spec.md`:

1. **Implement 24-Hour Frozen Cache Engine:**
   - In `artifacts/api-server/src/`:
   - Setup a caching layer with a strict 24-hour TTL (86,400,000 ms) keyed by user region and UTC date (`feed_${region}_${YYYY-MM-DD}`).
   - Freeze all row orderings, IDs, and poster mappings inside this 24-hour window so content never shuffles mid-day.
   - Run a scheduled background revalidation only after expiry.

2. **Hero Banner & Network Filtering:**
   - In `artifacts/api-server/src/routes/` and `artifacts/s-movie/`:
   - Bypass generic TMDb trending for the hero section; strictly query Netflix network (`with_networks=213`) sorted by latest release date with valid high-res backdrop paths.
   - Bind hero controls ("Play" and "My List") and render genre tags cleanly over the bottom fade gradient.

3. **Premium Top 10 Number Styling:**
   - On rows 6, 11, 30, 62, 67, and 90:
   - Apply metallic hollow/bordered typography (~90px, outline stroke `#595959`, transparent core, drop shadow).
   - Place numbers at the bottom-left overlapping the poster card margin with proper z-index.

4. **Dynamic Contextual Artwork:**
   - Implement the personalization logic: when fetching poster assets for titles, evaluate user genre affinity (e.g., preference for Romance selects warm-toned romantic stills/posters, Action selects high-energy stills).

5. **Deploy the 101-Category Feed:**
   - Mount and render all 101 rows strictly in the sequential order specified in `netflix-architecture-spec.md` (from 1. "Trending Now" through 101. "My Royal Nemesis & Sold Out on You").
   - Ensure every row queries its designated network (`213`), country code, genre ID, or title cluster without skipping.
