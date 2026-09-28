/**
 * S-MOVIE — Source Latency Racer
 *
 * Probes multiple embed sources concurrently using HEAD (fallback to GET)
 * and returns them sorted fastest-first. This ensures EmbedPlayer always
 * loads the lowest-latency working server before trying backups.
 *
 * Architecture:
 *   1. Fire HEAD probes to ALL sources simultaneously (no sequencing)
 *   2. On first response → mark latency, continue collecting rest
 *   3. Sort: working sources by latency, then failed sources
 *   4. Cache 30 min in AsyncStorage — subsequent plays are instant
 *   5. pickFastestSource() uses Promise.any for true "race to first" UX
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface RacedSource {
  url: string;
  source: string;
  latencyMs: number;
  ok: boolean;
}

export interface RaceResult {
  ranked: RacedSource[];          // all sources sorted fastest-first
  winner: RacedSource | null;     // fastest working source (null if all failed)
  totalMs: number;                // wall-clock time for the full race
}

// ─── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_PREFIX = "src_race_v2_";
const CACHE_TTL    = 30 * 60 * 1000; // 30 minutes

async function getCached(key: string): Promise<RaceResult | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { result, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { AsyncStorage.removeItem(CACHE_PREFIX + key); return null; }
    return result as RaceResult;
  } catch { return null; }
}

async function setCached(key: string, result: RaceResult) {
  try { await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ result, ts: Date.now() })); } catch {}
}

// ─── HTTP Probe ────────────────────────────────────────────────────────────────

const PROBE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36";

const PROBE_HEADERS: Record<string, string> = {
  "User-Agent":      PROBE_UA,
  "Accept":          "text/html,application/xhtml+xml,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
  "Referer":         "https://www.google.com/",
};

/**
 * Probe a single URL. HEAD first (fast, no body download), GET fallback
 * for servers that return 405 on HEAD.
 */
function probeOne(
  url: string,
  timeoutMs: number,
): Promise<{ ok: boolean; latencyMs: number }> {
  const t0 = Date.now();

  const tryMethod = (method: "HEAD" | "GET"): Promise<{ ok: boolean; latencyMs: number }> =>
    new Promise((resolve) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => {
        ctrl.abort();
        resolve({ ok: false, latencyMs: Date.now() - t0 });
      }, timeoutMs);

      fetch(url, { method, signal: ctrl.signal, headers: PROBE_HEADERS })
        .then((res) => {
          clearTimeout(timer);
          // 200-399 = working. 405 = alive but blocks HEAD → try GET.
          if (res.status === 405 && method === "HEAD") {
            resolve(tryMethod("GET"));
          } else {
            resolve({ ok: res.status >= 200 && res.status < 400, latencyMs: Date.now() - t0 });
          }
        })
        .catch(() => {
          clearTimeout(timer);
          if (method === "HEAD") {
            // HEAD rejected entirely → fall back to GET
            const remaining = timeoutMs - (Date.now() - t0);
            if (remaining > 200) resolve(tryMethod("GET"));
            else resolve({ ok: false, latencyMs: Date.now() - t0 });
          } else {
            resolve({ ok: false, latencyMs: Date.now() - t0 });
          }
        });
    });

  return tryMethod("HEAD");
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Race all sources concurrently. Returns them sorted fastest-first.
 *
 * Usage:
 *   const result = await raceSourceLatency(sources, 2500, "movie-155");
 *   // result.ranked[0] is the fastest confirmed working server
 *   // result.ranked[1], [2] ... are ordered fallbacks
 *
 * @param sources   - Array of { url, source } to probe
 * @param timeoutMs - Per-source deadline (default 2500ms)
 * @param cacheKey  - Optional AsyncStorage cache key (e.g. "movie-155-s1-e3")
 */
export async function raceSourceLatency(
  sources: Array<{ url: string; source: string }>,
  timeoutMs = 2500,
  cacheKey?: string,
): Promise<RaceResult> {
  if (sources.length === 0) {
    return { ranked: [], winner: null, totalMs: 0 };
  }

  if (cacheKey) {
    const cached = await getCached(cacheKey);
    if (cached) return cached;
  }

  const wall = Date.now();

  const probes = await Promise.allSettled(
    sources.map(async ({ url, source }) => {
      const { ok, latencyMs } = await probeOne(url, timeoutMs);
      return { url, source, latencyMs, ok } as RacedSource;
    }),
  );

  const ranked: RacedSource[] = probes
    .filter((r): r is PromiseFulfilledResult<RacedSource> => r.status === "fulfilled")
    .map((r) => r.value)
    .sort((a, b) => {
      // Working sources first, then by latency ascending
      if (a.ok && !b.ok) return -1;
      if (!a.ok && b.ok)  return 1;
      return a.latencyMs - b.latencyMs;
    });

  const winner = ranked.find((r) => r.ok) ?? null;
  const result: RaceResult = { ranked, winner, totalMs: Date.now() - wall };

  if (cacheKey) setCached(cacheKey, result);
  return result;
}

/**
 * Returns the fastest responding source using Promise.any — resolves as
 * soon as the FIRST working probe comes back. Much faster than raceSourceLatency
 * when you only need the winner (not the full ranking).
 *
 * Falls back to sources[0] if all probes fail.
 */
export async function pickFastestSource(
  sources: Array<{ url: string; source: string }>,
  timeoutMs = 2000,
): Promise<{ url: string; source: string }> {
  if (sources.length === 0) throw new Error("No sources provided");

  const race = (src: (typeof sources)[0]) =>
    new Promise<{ url: string; source: string }>((resolve, reject) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => { ctrl.abort(); reject(new Error("timeout")); }, timeoutMs);

      fetch(src.url, { method: "HEAD", signal: ctrl.signal, headers: PROBE_HEADERS })
        .then((res) => {
          clearTimeout(timer);
          if (res.status >= 200 && res.status < 400) resolve(src);
          else if (res.status === 405) {
            // HEAD blocked — try GET quickly
            const ctrl2 = new AbortController();
            const timer2 = setTimeout(() => { ctrl2.abort(); reject(new Error("timeout")); }, timeoutMs / 2);
            fetch(src.url, { method: "GET", signal: ctrl2.signal, headers: PROBE_HEADERS })
              .then((r2) => { clearTimeout(timer2); r2.ok ? resolve(src) : reject(new Error(`HTTP ${r2.status}`)); })
              .catch(() => { clearTimeout(timer2); reject(new Error("failed")); });
          } else {
            reject(new Error(`HTTP ${res.status}`));
          }
        })
        .catch(() => { clearTimeout(timer); reject(new Error("failed")); });
    });

  try {
    return await (Promise as any).any(sources.map(race));
  } catch {
    return sources[0]; // all failed — return first as default
  }
}

/**
 * Kick off a background latency race without blocking.
 * The results are stored in cache so the NEXT call is instant.
 * Use this to "warm up" the source cache while the user is still
 * browsing (before they hit play).
 */
export function prefetchRace(
  sources: Array<{ url: string; source: string }>,
  cacheKey: string,
  timeoutMs = 3000,
): void {
  raceSourceLatency(sources, timeoutMs, cacheKey).catch(() => {});
}
