
const BASE_URL = "https://hdhub4u.tv";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface HDHubMovie {
  id: string;
  title: string;
  poster: string;
  url: string;
  quality?: string;
  year?: number;
}

export interface HDHubDetail extends HDHubMovie {
  synopsis?: string;
  streamUrl?: string; // Extracted direct link or embed
  screenshots?: string[];
  links?: { label: string; url: string }[];
}

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Referer": BASE_URL,
    },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.text();
}

/**
 * Parses movie cards from HTML.
 * HDHub structure is typically:
 * <article id="post-XXX">
 *   <div class="poster"><img src="..." ...></div>
 *   <div class="details"><a href="...">...</a></div>
 * </article>
 */
function parseMovies(html: string): HDHubMovie[] {
  const movies: HDHubMovie[] = [];
  // Use regex to find post blocks or loop through markers
  // This is a simplified regex approach as cheerio is not available
  const postRegex = /<article[^>]*id="post-(\d+)"[^>]*>([\s\S]*?)<\/article>/g;
  let match;
  while ((match = postRegex.exec(html)) !== null) {
    const id = match[1];
    const content = match[2];
    
    const urlMatch = /href="([^"]+)"/.exec(content);
    const titleMatch = /title="([^"]+)"/.exec(content) || /alt="([^"]+)"/.exec(content);
    const imgMatch = /src="([^"]+)"/.exec(content);
    
    if (urlMatch && titleMatch && imgMatch) {
      movies.push({
        id,
        url: urlMatch[1],
        title: titleMatch[1].replace(/Download /i, "").trim(),
        poster: imgMatch[1],
      });
    }
  }
  return movies;
}

export const hdhub = {
  getLatest: async (page = 1): Promise<HDHubMovie[]> => {
    const url = page === 1 ? BASE_URL : `${BASE_URL}/page/${page}`;
    const html = await fetchHtml(url);
    return parseMovies(html);
  },

  search: async (query: string, page = 1): Promise<HDHubMovie[]> => {
    const url = `${BASE_URL}/page/${page}/?s=${encodeURIComponent(query)}`;
    const html = await fetchHtml(url);
    return parseMovies(html);
  },

  getDetails: async (movieUrl: string): Promise<HDHubDetail> => {
    const html = await fetchHtml(movieUrl);
    
    // Extract synopsis
    const synopsisMatch = /<p[^>]*>(Wait for 10 seconds|Synopsis|Storyline|About):?\s*<\/p>\s*<p>(.*?)<\/p>/i.exec(html) 
                        || /<meta name="description" content="([^"]+)"/.exec(html);
                        
    // Find video links - usually HDHub points to a download page which then goes to a stream
    // For "Direct Play", we check for any embed or common streaming patterns.
    // If not found, we use the first available high-quality download link.
    
    const downloadBtns: { label: string; url: string }[] = [];
    const btnRegex = /<a[^>]*href="([^"]*?)"[^>]*class="[^"]*?button[^"]*?"[^>]*>(.*?)<\/a>/g;
    let bMatch;
    while((bMatch = btnRegex.exec(html)) !== null) {
        if (bMatch[1].includes("/?go=") || bMatch[1].includes("cloud")) {
            downloadBtns.push({ label: bMatch[2].replace(/<[^>]*>/g, "").trim(), url: bMatch[1] });
        }
    }
    
    // Detect "Watch Online" embed if present
    const watchMatch = /<iframe[^>]*src="([^"]+)"/.exec(html);

    return {
      id: movieUrl,
      url: movieUrl,
      title: "", // should be passed or parsed from title tag
      poster: "",
      synopsis: synopsisMatch ? synopsisMatch[1] : "",
      streamUrl: watchMatch ? watchMatch[1] : (downloadBtns[0]?.url || ""),
      links: downloadBtns
    };
  }
};
