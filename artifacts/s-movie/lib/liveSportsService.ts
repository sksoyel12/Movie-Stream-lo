/**
 * LiveSportsService — Live sports & broadcast stream resolver
 *
 * All 8 sports portals from the catalog are loaded as embed URLs.
 * The player renders them as WebView iframes — no external browser needed.
 *
 * Usage:
 *   const sources = getLiveSportEmbeds();
 *   // Pass sources[0].url to the player as an embed URL
 *
 * Channel/event matching:
 *   Use matchSportsChannel() to filter sources that expose a channel-level
 *   URL for a given sport keyword (nfl, nba, ipl, cricket, etc.).
 */

import { getLiveSportsSources, type SourceEntry } from "./sourceCatalog";

export interface LiveSportSource {
  id: string;
  name: string;
  url: string;
  isEmbed: true;
  indieFriendly: boolean;
}

// Known channel/sport path overrides per source id.
// These are the deepest public URLs each portal exposes without auth.
const CHANNEL_PATHS: Record<string, Record<string, string>> = {
  tv247: {
    nfl: "https://tv247.us/nfl/",
    nba: "https://tv247.us/nba/",
    mlb: "https://tv247.us/mlb/",
    nhl: "https://tv247.us/nhl/",
    ufc: "https://tv247.us/ufc/",
    boxing: "https://tv247.us/boxing/",
    soccer: "https://tv247.us/soccer/",
    cricket: "https://tv247.us/cricket/",
    tennis: "https://tv247.us/tennis/",
  },
  istreameast: {
    nfl: "https://istreameast.app/nfl",
    nba: "https://istreameast.app/nba",
    mlb: "https://istreameast.app/mlb",
    nhl: "https://istreameast.app/nhl",
    boxing: "https://istreameast.app/boxing",
    ufc: "https://istreameast.app/ufc",
    soccer: "https://istreameast.app/soccer",
  },
  beststreameast: {
    nfl: "https://beststreameast.net/nfl",
    nba: "https://beststreameast.net/nba",
    mlb: "https://beststreameast.net/mlb",
    nhl: "https://beststreameast.net/nhl",
    ufc: "https://beststreameast.net/ufc",
    soccer: "https://beststreameast.net/soccer",
  },
  sportplus: {
    cricket: "https://en12.sportplus.live/cricket",
    soccer: "https://en12.sportplus.live/soccer",
    tennis: "https://en12.sportplus.live/tennis",
    basketball: "https://en12.sportplus.live/basketball",
  },
  "rivestream-sports": {
    default: "https://rivestream.ru/livesports",
  },
};

/**
 * Returns all live-sports portal entries as structured sources.
 * Each has `isEmbed: true` — pass `.url` straight into the player.
 */
export function getLiveSportEmbeds(): LiveSportSource[] {
  return getLiveSportsSources().map((entry: SourceEntry) => ({
    id: entry.id,
    name: entry.name,
    url: entry.homeUrl,
    isEmbed: true as const,
    indieFriendly: entry.indieFriendly ?? false,
  }));
}

/**
 * Returns sources that have a known deep-link for a sport keyword.
 * Falls back to the portal home if no channel override exists.
 *
 * @param sport  e.g. "nfl", "nba", "cricket", "soccer"
 */
export function matchSportsChannel(sport: string): LiveSportSource[] {
  const key = sport.toLowerCase().trim();
  return getLiveSportsSources().map((entry: SourceEntry) => {
    const paths = CHANNEL_PATHS[entry.id] ?? {};
    const url = paths[key] ?? paths["default"] ?? entry.homeUrl;
    return {
      id: entry.id,
      name: entry.name,
      url,
      isEmbed: true as const,
      indieFriendly: entry.indieFriendly ?? false,
    };
  });
}

/**
 * Sport categories surfaced in the UI sports picker.
 */
export const SPORTS_CATEGORIES = [
  { id: "soccer",      label: "Soccer / Football", icon: "⚽" },
  { id: "cricket",     label: "Cricket",            icon: "🏏" },
  { id: "nba",         label: "NBA Basketball",     icon: "🏀" },
  { id: "nfl",         label: "NFL Football",       icon: "🏈" },
  { id: "nhl",         label: "NHL Hockey",         icon: "🏒" },
  { id: "mlb",         label: "MLB Baseball",       icon: "⚾" },
  { id: "tennis",      label: "Tennis",             icon: "🎾" },
  { id: "ufc",         label: "UFC / MMA",          icon: "🥊" },
  { id: "boxing",      label: "Boxing",             icon: "🥊" },
  { id: "basketball",  label: "Basketball",         icon: "🏀" },
  { id: "all",         label: "All Live Sports",    icon: "📺" },
] as const;

export type SportId = (typeof SPORTS_CATEGORIES)[number]["id"];
