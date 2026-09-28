export type ReleaseNote = {
  version: string;
  date: string;
  title?: string;
  highlights: string[];
};

export const CURRENT_VERSION = "2.1.0";

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "2.2.0",
    date: "May 25, 2026",
    title: "Update Checker Fixed + Proxy Engine Upgrade",
    highlights: [
      "Fixed 'Could not reach update server' — direct APK delivery now works from any network",
      "Hardcoded production API fallback so updates work even without VPN or custom config",
      "Built-in premium proxy network upgrade — zero external VPN setup required",
      "Ad-free stream engine improvements for faster source resolution",
      "Premium app icon and redesigned marketing landing page",
      "Version check now accurately compares v2.2.0 and shows a beautiful update dialog",
    ],
  },
  {
    version: "2.1.0",
    date: "May 16, 2026",
    title: "Netmirror-Style Poster Banner",
    highlights: [
      "Hero banner redesigned: portrait poster card with rounded corners — exactly like Netmirror",
      "No more text title overlay — the poster artwork speaks for itself",
      "Deep black gradient blends the card edge seamlessly into the app background",
      "Play & My List buttons sit neatly below the poster, side by side",
      "Check for Updates now works with live toast feedback — no more silent failures",
      "Downloads tab promoted to first position in the bottom navigation bar",
      "\"What's New\" premium splash screen shows automatically on every update",
    ],
  },
  {
    version: "2.0.0",
    date: "May 15, 2026",
    title: "S-Movie Original — Ultimate Overhaul",
    highlights: [
      "Full Netflix-style UI: edge-to-edge hero banner with gradient mask",
      "14 auto-play embed sources (superembed, smashystream, 2embed & more)",
      "5-second silent fallback — player skips broken sources automatically",
      "New S-Movie Original branding with vibrancy gradient in header",
      "Movie details strip: genres, runtime & rating inside hero banner",
      "OTA updates enabled — UI fixes push without a new APK install",
      "Glassmorphism category pills & upgraded Home header layout",
    ],
  },
  {
    version: "1.6.0",
    date: "May 12, 2026",
    title: "Major Stream & Search Update",
    highlights: [
      "Added 8+ new movie & series sources (KissKH, Mlwbd, SouthFreak, etc.)",
      "New global search icon in header for faster access",
      "Fixed poster loading issues with enhanced image proxying",
      "Auto-resolver now searches across multiple providers simultaneously",
      "Added Google Drive indexers (Minoplres, NexDrive) for high-speed streaming",
      "Enhanced resource modal shows source provider and quality clearly",
      "Minor UI polish on tab buttons and header layout",
    ],
  },
  {
    version: "1.3.0",
    date: "May 10, 2026",
    title: "What's New in S-MOVIE ORIGINAL",
    highlights: [
      "What's New screen on every update — see exactly what changed",
      "Monorepo Metro config fixed for rock-solid APK builds",
      "Stream aggregator upgraded — faster source-hopping with real fallback CDN",
      "Episode thumbnails now load from live TMDB with skeleton placeholders",
      "Poster quality improved — all cards use high-res w500 TMDB images",
      "All buttons audited: hitSlop expanded, pressed feedback on every tap",
      "Version checker updated to v1.3.0 in API server",
    ],
  },
  {
    version: "1.2.0",
    date: "May 01, 2026",
    title: "Live Catalog, Games & In-App Updates",
    highlights: [
      "TMDB live movie & show catalog with infinite scroll",
      "IMDb rating badges on every card",
      "Native Snake game in the Games tab",
      "Downloads tab with offline tracking",
      "Season selector on TV show detail pages",
      "In-app APK updater — no need to visit a store",
    ],
  },
  {
    version: "1.1.0",
    date: "April 30, 2026",
    title: "Search, Sharing & Smart Notifications",
    highlights: [
      "Search any movie, show, actor, or genre instantly",
      "Share titles with friends straight from the app",
      "Set reminders for upcoming releases in New & Hot",
      "Tap a notification to jump straight to the movie",
      "Brand new Profile screen with Check for Updates",
    ],
  },
  {
    version: "1.0.0",
    date: "April 30, 2026",
    title: "Welcome to S-Movie Original",
    highlights: [
      "Browse trending movies and Top 10 picks",
      "Save favorites to your personal My List",
      "Beautiful cinematic dark interface",
      "Auto-update support — fresh content delivered without reinstalling the app",
    ],
  },
];

export const LATEST_RELEASE = RELEASE_NOTES[0];
