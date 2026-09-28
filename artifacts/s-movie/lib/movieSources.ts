import { SITE_DOMAINS } from "./siteConfig";
import { searchMovieBox } from "./movieboxApi";

const USER_AGENT = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36";

export interface SourceLink {
  label: string;
  url: string;
  quality: string;
  provider: string;
}

async function fetchHtml(url: string) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Referer": new URL(url).origin,
      },
    });
    if (!res.ok) return "";
    return res.text();
  } catch {
    return "";
  }
}

/**
 * Vegamovies Resolver
 */
async function resolveVegamovies(query: string): Promise<SourceLink[]> {
  const baseUrl = SITE_DOMAINS.vegamovies;
  const searchUrl = `${baseUrl}/?s=${encodeURIComponent(query)}`;
  const html = await fetchHtml(searchUrl);
  
  const links: SourceLink[] = [];
  const postRegex = /<article[^>]*>([\s\S]*?)<\/article>/g;
  let match;
  
  // Just get the first match for now to avoid too many fetches
  if ((match = postRegex.exec(html)) !== null) {
    const content = match[1];
    const urlMatch = /href="([^"]+)"/.exec(content);
    if (urlMatch) {
      const detailHtml = await fetchHtml(urlMatch[1]);
      const btnRegex = /<a[^>]*href="([^"]*?)"[^>]*class="[^"]*?button[^"]*?"[^>]*>(.*?)<\/a>/g;
      let bMatch;
      while((bMatch = btnRegex.exec(detailHtml)) !== null) {
        if (bMatch[1].includes("v-cloud") || bMatch[1].includes("download")) {
          links.push({
            label: bMatch[2].replace(/<[^>]*>/g, "").trim() || "Watch / Download",
            url: bMatch[1],
            quality: bMatch[2].includes("1080p") ? "1080p" : bMatch[2].includes("720p") ? "720p" : "HD",
            provider: "Vegamovies"
          });
        }
      }
    }
  }
  return links;
}

/**
 * MoviesMod Resolver
 */
async function resolveMoviesMod(query: string): Promise<SourceLink[]> {
  const baseUrl = "https://moviesmod.farm";
  const searchUrl = `${baseUrl}/?s=${encodeURIComponent(query)}`;
  const html = await fetchHtml(searchUrl);
  
  const links: SourceLink[] = [];
  const urlMatch = /<h2[^>]*class="entry-title"[^>]*><a href="([^"]+)"/.exec(html);
  if (urlMatch) {
    const detailHtml = await fetchHtml(urlMatch[1]);
    const btnRegex = /<a[^>]*href="([^"]*?)"[^>]*class="[^"]*?btn[^"]*?"[^>]*>(.*?)<\/a>/g;
    let bMatch;
    while((bMatch = btnRegex.exec(detailHtml)) !== null) {
      if (bMatch[1].includes("drive") || bMatch[1].includes("link") || bMatch[1].includes("mod")) {
        links.push({
          label: bMatch[2].replace(/<[^>]*>/g, "").trim() || "Fast Server",
          url: bMatch[1],
          quality: bMatch[2].includes("1080p") ? "1080p" : "HD",
          provider: "MoviesMod"
        });
      }
    }
  }
  return links;
}

/**
 * AnimeWorld (Anime World India)
 */
async function resolveAnimeWorld(query: string): Promise<SourceLink[]> {
  const baseUrl = "https://animeworldindia.com";
  const searchUrl = `${baseUrl}/?s=${encodeURIComponent(query)}`;
  const html = await fetchHtml(searchUrl);
  
  const links: SourceLink[] = [];
  const urlMatch = /<a href="([^"]+)"[^>]*class="[^"]*?entry-image-link[^"]*?"/.exec(html);
  if (urlMatch) {
    const detailHtml = await fetchHtml(urlMatch[1]);
    const streamMatch = /<iframe[^>]*src="([^"]+)"/.exec(detailHtml);
    if (streamMatch) {
      links.push({
        label: "Stream Online",
        url: streamMatch[1],
        quality: "HD",
        provider: "AnimeWorldIndia"
      });
    }
  }
  return links;
}

/**
 * FzMovies Resolver
 */
async function resolveFzMovies(query: string): Promise<SourceLink[]> {
  const baseUrl = SITE_DOMAINS.fzmovies;
  // FzMovies often uses a different searching mechanism, but many mirrors support standard search
  const searchUrl = `${baseUrl}/search.php?searchname=${encodeURIComponent(query)}&searchby=moviename`;
  const html = await fetchHtml(searchUrl);
  
  const links: SourceLink[] = [];
  // FzMovies structure for search results is often tables or divs with specific classes
  const postRegex = /<div class="maincont">([\s\S]*?)<\/div>/g;
  let match;
  
  if ((match = postRegex.exec(html)) !== null) {
    const content = match[1];
    const itemRegex = /<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let iMatch;
    while ((iMatch = itemRegex.exec(content)) !== null) {
      const url = iMatch[1].startsWith("http") ? iMatch[1] : `${baseUrl}/${iMatch[1]}`;
      const title = iMatch[2].replace(/<[^>]*>/g, "").trim();
      
      if (title.toLowerCase().includes(query.toLowerCase())) {
        links.push({
          label: title,
          url: url,
          quality: "HD",
          provider: "FzMovies.cms"
        });
      }
    }
  }
  return links;
}

/**
 * KissKH Resolver
 */
async function resolveKissKH(query: string): Promise<SourceLink[]> {
  const baseUrl = "https://kisskh.com";
  const searchUrl = `${baseUrl}/api/Search?q=${encodeURIComponent(query)}&type=1`;
  try {
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": USER_AGENT }
    });
    const data = await res.json();
    const links: SourceLink[] = [];
    if (data && Array.isArray(data)) {
      for (const item of data.slice(0, 3)) {
        links.push({
          label: item.title || "Watch on KissKH",
          url: `${baseUrl}/Drama/${item.title?.replace(/ /g, "-")}?id=${item.id}&q=1`,
          quality: "720p",
          provider: "KissKH"
        });
      }
    }
    return links;
  } catch {
    return [];
  }
}

/**
 * MLWBD Resolver
 */
async function resolveMlwbd(query: string): Promise<SourceLink[]> {
  const baseUrl = "https://mlwbd.st";
  const searchUrl = `${baseUrl}/?s=${encodeURIComponent(query)}`;
  const html = await fetchHtml(searchUrl);
  
  const links: SourceLink[] = [];
  const postRegex = /<div[^>]*class="result-item">([\s\S]*?)<\/div>/g;
  let match;
  
  if ((match = postRegex.exec(html)) !== null) {
    const content = match[1];
    const urlMatch = /href="([^"]+)"/.exec(content);
    if (urlMatch) {
      const detailHtml = await fetchHtml(urlMatch[1]);
      const btnRegex = /<a[^>]*href="([^"]*?)"[^>]*class="[^"]*?download-btn[^"]*?"[^>]*>(.*?)<\/a>/g;
      let bMatch;
      while((bMatch = btnRegex.exec(detailHtml)) !== null) {
        links.push({
          label: bMatch[2].replace(/<[^>]*>/g, "").trim() || "Download Source",
          url: bMatch[1],
          quality: bMatch[2].includes("1080p") ? "1080p" : "720p",
          provider: "MLWBD"
        });
      }
    }
  }
  return links;
}

/**
 * SouthFreak Resolver
 */
async function resolveSouthFreak(query: string): Promise<SourceLink[]> {
  const baseUrl = "https://southfreak.wiki";
  const searchUrl = `${baseUrl}/?s=${encodeURIComponent(query)}`;
  const html = await fetchHtml(searchUrl);
  
  const links: SourceLink[] = [];
  const urlMatch = /<h2[^>]*><a href="([^"]+)"/.exec(html);
  if (urlMatch) {
    const detailHtml = await fetchHtml(urlMatch[1]);
    const btnRegex = /<a[^>]*href="([^"]*?)"[^>]*class="[^"]*?btn[^"]*?"[^>]*>(.*?)<\/a>/g;
    let bMatch;
    while((bMatch = btnRegex.exec(detailHtml)) !== null) {
      if (bMatch[1].includes("gdtot") || bMatch[1].includes("drive") || bMatch[1].includes("link")) {
        links.push({
          label: bMatch[2].replace(/<[^>]*>/g, "").trim() || "Watch / Download",
          url: bMatch[1],
          quality: bMatch[2].includes("1080p") ? "1080p" : "720p",
          provider: "SouthFreak"
        });
      }
    }
  }
  return links;
}

/**
 * MkvCinemas Resolver
 */
async function resolveMkvCinemas(query: string): Promise<SourceLink[]> {
  const baseUrl = "https://mkvcinemas.cat";
  const searchUrl = `${baseUrl}/?s=${encodeURIComponent(query)}`;
  const html = await fetchHtml(searchUrl);
  
  const links: SourceLink[] = [];
  const urlMatch = /<h2[^>]*class="entry-title"[^>]*><a href="([^"]+)"/.exec(html);
  if (urlMatch) {
    const detailHtml = await fetchHtml(urlMatch[1]);
    const btnRegex = /<a[^>]*href="([^"]*?)"[^>]*class="[^"]*?button[^"]*?"[^>]*>(.*?)<\/a>/g;
    let bMatch;
    while((bMatch = btnRegex.exec(detailHtml)) !== null) {
      if (bMatch[1].includes("drive") || bMatch[1].includes("link") || bMatch[1].includes("fast")) {
        links.push({
          label: bMatch[2].replace(/<[^>]*>/g, "").trim() || "Watch / Download",
          url: bMatch[1],
          quality: bMatch[2].includes("1080p") ? "1080p" : "720p",
          provider: "MkvCinemas"
        });
      }
    }
  }
  return links;
}

/**
 * Minoplres / NexDrive Resolver (Google Drive Indexers)
 */
async function resolveDriveIndexers(query: string): Promise<SourceLink[]> {
  const sources = [
    { name: "Minoplres", url: "https://minoplres.xyz" },
    { name: "NexDrive", url: "https://nexdrive.fun" },
  ];
  
  const links: SourceLink[] = [];
  try {
    const results = await Promise.allSettled(sources.map(async (s) => {
      const searchUrl = `${s.url}/?s=${encodeURIComponent(query)}`;
      const html = await fetchHtml(searchUrl);
      const urlMatch = /<h2[^>]*><a href="([^"]+)"/.exec(html);
      if (urlMatch) {
         return { name: s.name, detailUrl: urlMatch[1] };
      }
      return null;
    }));

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        const detailHtml = await fetchHtml(r.value.detailUrl);
        const btnRegex = /<a[^>]*href="([^"]*?)"[^>]*class="[^"]*?btn[^"]*?"[^>]*>(.*?)<\/a>/g;
        let bMatch;
        while((bMatch = btnRegex.exec(detailHtml)) !== null) {
          if (bMatch[1].includes("drive") || bMatch[1].includes("link") || bMatch[1].includes("gd")) {
            links.push({
              label: bMatch[2].replace(/<[^>]*>/g, "").trim() || "Drive Link",
              url: bMatch[1],
              quality: bMatch[2].includes("1080p") ? "1080p" : "720p",
              provider: r.value.name
            });
          }
        }
      }
    }
  } catch {}
  return links;
}

/**
 * O2TVSeries Resolver (Excellent for mobile/old series)
 */
async function resolveO2TVSeries(query: string): Promise<SourceLink[]> {
  const baseUrl = "https://o2tvseries2.com";
  const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(query)}`;
  const html = await fetchHtml(searchUrl);
  
  const links: SourceLink[] = [];
  const linkRegex = /<div[^>]*class="data">[^]*?<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  
  if ((match = linkRegex.exec(html)) !== null) {
    const detailUrl = match[1];
    const detailHtml = await fetchHtml(detailUrl);
    // O2TV is deep-nested (Show > Season > Episode), so we just return the season/show link if we can't deep resolve
    links.push({
      label: match[2].replace(/<[^>]*>/g, "").trim(),
      url: detailUrl,
      quality: "480p",
      provider: "O2TVSeries"
    });
  }
  return links;
}

/**
 * Ailok Resolver
 */
async function resolveAilok(query: string): Promise<SourceLink[]> {
  const baseUrl = "https://ailok.pe";
  const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(query)}`;
  const html = await fetchHtml(searchUrl);
  
  const links: SourceLink[] = [];
  const urlMatch = /<a href="([^"]+)"[^>]*class="[^"]*?search-item[^"]*?"/.exec(html);
  if (urlMatch) {
    const detailHtml = await fetchHtml(urlMatch[1]);
    const btnRegex = /<a[^>]*href="([^"]*?)"[^>]*class="[^"]*?download-link[^"]*?"[^>]*>(.*?)<\/a>/g;
    let bMatch;
    while((bMatch = btnRegex.exec(detailHtml)) !== null) {
      links.push({
        label: bMatch[2].replace(/<[^>]*>/g, "").trim() || "Watch / Download",
        url: bMatch[1],
        quality: bMatch[2].includes("1080p") ? "1080p" : "720p",
        provider: "Ailok"
      });
    }
  }
  return links;
}

/**
 * VegaMovies MQ resolver (updated domain from catalog)
 */
async function resolveVegamoviesMQ(query: string): Promise<SourceLink[]> {
  const baseUrl = "https://vegamovies.mq";
  const searchUrl = `${baseUrl}/?s=${encodeURIComponent(query)}`;
  const html = await fetchHtml(searchUrl);

  const links: SourceLink[] = [];
  const postRegex = /<article[^>]*>([\s\S]*?)<\/article>/g;
  let match;

  if ((match = postRegex.exec(html)) !== null) {
    const content = match[1];
    const urlMatch = /href="([^"]+)"/.exec(content);
    if (urlMatch) {
      const detailHtml = await fetchHtml(urlMatch[1]);
      const btnRegex = /<a[^>]*href="([^"]*?)"[^>]*class="[^"]*?button[^"]*?"[^>]*>(.*?)<\/a>/g;
      let bMatch;
      while ((bMatch = btnRegex.exec(detailHtml)) !== null) {
        if (bMatch[1].includes("v-cloud") || bMatch[1].includes("download")) {
          links.push({
            label: bMatch[2].replace(/<[^>]*>/g, "").trim() || "Watch / Download",
            url: bMatch[1],
            quality: bMatch[2].includes("1080p") ? "1080p" : bMatch[2].includes("720p") ? "720p" : "HD",
            provider: "VegaMovies",
          });
        }
      }
    }
  }
  return links;
}

/**
 * FMovies resolver (fmovies-hd.to)
 */
async function resolveFMovies(query: string): Promise<SourceLink[]> {
  const baseUrl = "https://fmovies-hd.to";
  const searchUrl = `${baseUrl}/search/${encodeURIComponent(query)}`;
  const html = await fetchHtml(searchUrl);

  const links: SourceLink[] = [];
  const urlMatch = /<a[^>]*href="(\/film\/[^"]+)"[^>]*class="[^"]*?result[^"]*?"/.exec(html);
  if (urlMatch) {
    links.push({
      label: "Stream on FMovies",
      url: `${baseUrl}${urlMatch[1]}`,
      quality: "HD",
      provider: "FMovies",
    });
  }
  return links;
}

/**
 * Donkey.to resolver
 */
async function resolveDonkey(query: string): Promise<SourceLink[]> {
  const baseUrl = "https://donkey.to";
  const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(query)}`;
  const html = await fetchHtml(searchUrl);

  const links: SourceLink[] = [];
  const urlMatch = /<a[^>]*href="(\/(?:movie|show)\/[^"]+)"/.exec(html);
  if (urlMatch) {
    links.push({
      label: "Stream on Donkey",
      url: `${baseUrl}${urlMatch[1]}`,
      quality: "HD",
      provider: "Donkey.to",
    });
  }
  return links;
}

/**
 * SFlix resolver (sflix.fi)
 */
async function resolveSFlix(query: string): Promise<SourceLink[]> {
  const baseUrl = "https://sflix.fi";
  const searchUrl = `${baseUrl}/search/${encodeURIComponent(query)}`;
  const html = await fetchHtml(searchUrl);

  const links: SourceLink[] = [];
  const urlMatch = /<a[^>]*href="(\/(?:movie|tv)\/[^"]+)"/.exec(html);
  if (urlMatch) {
    links.push({
      label: "Stream on SFlix",
      url: `${baseUrl}${urlMatch[1]}`,
      quality: "HD",
      provider: "SFlix",
    });
  }
  return links;
}

/**
 * MovieBox API mirror resolver.
 *
 * Some mirrors return a resource URL directly in search metadata. Only those
 * explicitly returned URLs are surfaced; detail pages are not guessed because
 * regional MovieBox web routes differ.
 */
async function resolveMovieBoxApi(query: string): Promise<SourceLink[]> {
  const results = await searchMovieBox(query);

  return results
    .map((item) => {
      const url = item.streamUrl ?? item.resourceUrl ?? item.downloadUrl;
      if (!url) return null;

      return {
        label: `MovieBox · ${item.title}`,
        url,
        quality: "HD",
        provider: "MovieBox API",
      } satisfies SourceLink;
    })
    .filter((link): link is SourceLink => link !== null);
}

/**
 * Combined Multi-Source Resolver
 */
export async function resolveAllSources(title: string, season?: number, episode?: number): Promise<SourceLink[]> {
  const cleanTitle = title.split(/[(\[]/)[0].trim();
  const searchQuery = season ? `${cleanTitle} Season ${season}` : cleanTitle;

  // Try sources in parallel
  // NOTE: fzmovies.cms is BLACKLISTED — causes DNS crash; never call it.
  const results = await Promise.allSettled([
    resolveVegamovies(searchQuery),
    resolveVegamoviesMQ(searchQuery),
    resolveMoviesMod(searchQuery),
    resolveAnimeWorld(cleanTitle),
    resolveKissKH(searchQuery),
    resolveMlwbd(searchQuery),
    resolveSouthFreak(searchQuery),
    resolveMkvCinemas(searchQuery),
    resolveDriveIndexers(searchQuery),
    resolveO2TVSeries(cleanTitle),
    resolveAilok(searchQuery),
    resolveFMovies(searchQuery),
    resolveDonkey(searchQuery),
    resolveSFlix(searchQuery),
    resolveMovieBoxApi(cleanTitle),
  ]);
  
  const allLinks: SourceLink[] = [];
  results.forEach(r => {
    if (r.status === "fulfilled") {
      allLinks.push(...r.value);
    }
  });
  
  // If we have an episode, we should try to filter or prioritize links that mention that episode
  if (episode != null && allLinks.length > 0) {
     const epStr = `E${episode.toString().padStart(2, '0')}`;
     const epAlt = `Episode ${episode}`;
     const fullPattern = season ? `S${season.toString().padStart(2, '0')}${epStr}` : epStr;
     
     // Sort so links containing episode info come first
     allLinks.sort((a, b) => {
       const aLabel = a.label.toUpperCase();
       const bLabel = b.label.toUpperCase();
       const aHasEp = aLabel.includes(epStr.toUpperCase()) || aLabel.includes(epAlt.toUpperCase()) || aLabel.includes(fullPattern.toUpperCase());
       const bHasEp = bLabel.includes(epStr.toUpperCase()) || bLabel.includes(epAlt.toUpperCase()) || bLabel.includes(fullPattern.toUpperCase());
       if (aHasEp && !bHasEp) return -1;
       if (!aHasEp && bHasEp) return 1;
       return 0;
     });
  }
  
  return allLinks;
}
