import { hdhub, type HDHubMovie } from "@/lib/hdhub";
import { tmdb, tmdbToCard, proxyUrl, type TMDBPage } from "@/lib/tmdb";
import { HOME_CATEGORIES } from "@/lib/categoryMap";

export interface SeeAllCard {
  id: string;
  title: string;
  posterUri: string;
  mediaType: "movie" | "tv";
  hdhubUrl?: string;
}

export type RowFetcherEntry =
  | { kind: "tmdb"; fn: (page: number) => Promise<TMDBPage>; mediaType: "movie" | "tv" }
  | { kind: "hdhub"; fn: (page: number) => Promise<HDHubMovie[]> };

export const ROW_FETCHERS: Record<string, RowFetcherEntry> = {
  // ── Home tab — 42 category rows ────────────────────────────────────────────
  "Trending Now":                                          { kind: "tmdb", fn: (p) => tmdb.trending(p),                      mediaType: "tv"    },
  "Meet Your Next Binge":                                  { kind: "tmdb", fn: (p) => tmdb.meetNextBinge(p),                  mediaType: "tv"    },
  "Your Next Watch":                                       { kind: "tmdb", fn: (p) => tmdb.yourNextWatch(p),                  mediaType: "tv"    },
  "Romantic Shows":                                        { kind: "tmdb", fn: (p) => tmdb.romanticShows(p),                  mediaType: "tv"    },
  "Top 10 Movies in India Today":                          { kind: "tmdb", fn: (p) => tmdb.top10MoviesIndia(p),               mediaType: "movie" },
  "We Think You'll Love These":                            { kind: "tmdb", fn: (p) => tmdb.weThinkYoullLove(p),               mediaType: "tv"    },
  "Romantic East Asian TV Shows":                          { kind: "tmdb", fn: (p) => tmdb.romanticEastAsian(p),              mediaType: "tv"    },
  "First Love Romance":                                    { kind: "tmdb", fn: (p) => tmdb.firstLoveRomance(p),               mediaType: "tv"    },
  "K-Dramas":                                              { kind: "tmdb", fn: (p) => tmdb.koreanDramas(p),                   mediaType: "tv"    },
  "US TV Shows":                                           { kind: "tmdb", fn: (p) => tmdb.usTVShows(p),                      mediaType: "tv"    },
  "From K-Pop to K-Dramas":                               { kind: "tmdb", fn: (p) => tmdb.fromKPopToKDramas(p),              mediaType: "tv"    },
  "Critically Acclaimed TV Shows":                         { kind: "tmdb", fn: (p) => tmdb.awardWinningTV(p),                 mediaType: "tv"    },
  "Love language":                                         { kind: "tmdb", fn: (p) => tmdb.romanticInternational(p),          mediaType: "tv"    },
  "Romantic Asian TV Shows":                               { kind: "tmdb", fn: (p) => tmdb.romanticAsianTV(p),                mediaType: "tv"    },
  "Downloads For You":                                     { kind: "tmdb", fn: (p) => tmdb.hindiTopRated(p),                  mediaType: "movie" },
  "Can this love be translated":                           { kind: "tmdb", fn: (p) => tmdb.canThisLoveBeTranslated(p),        mediaType: "tv"    },
  "Fantasy TV Shows":                                      { kind: "tmdb", fn: (p) => tmdb.scifiFantasyTV(p),                 mediaType: "tv"    },
  "Romantic Korean TV Comedies":                           { kind: "tmdb", fn: (p) => tmdb.romanticKoreanComedies(p),         mediaType: "tv"    },
  "Made in India":                                         { kind: "tmdb", fn: (p) => tmdb.madeInIndia(p),                    mediaType: "tv"    },
  "Romantic International Opposites-Attract TV Dramas":    { kind: "tmdb", fn: (p) => tmdb.oppositesAttract(p),               mediaType: "tv"    },
  "K-Dramas Dubbed in Hindi":                              { kind: "tmdb", fn: (p) => tmdb.koreanDramasHindi(p),              mediaType: "tv"    },
  "Mysteries Dramas":                                      { kind: "tmdb", fn: (p) => tmdb.koreanThrillers(p),                mediaType: "tv"    },
  "US TV Comedies":                                        { kind: "tmdb", fn: (p) => tmdb.usTVComedies(p),                   mediaType: "tv"    },
  "Suspenseful TV Shows":                                  { kind: "tmdb", fn: (p) => tmdb.suspensefulTV(p),                  mediaType: "tv"    },
  "Korean TV Dramas":                                      { kind: "tmdb", fn: (p) => tmdb.popularKoreanTV(p),                mediaType: "tv"    },
  "Romantic International TV Comedies":                    { kind: "tmdb", fn: (p) => tmdb.romanticIntlComedies(p),           mediaType: "tv"    },
  "Familiar Favourite Series":                             { kind: "tmdb", fn: (p) => tmdb.familiarFavourites(p),             mediaType: "tv"    },
  "Asian Movies & TV":                                     { kind: "tmdb", fn: (p) => tmdb.asianMovieTV(p),                   mediaType: "tv"    },
  "Anime":                                                 { kind: "tmdb", fn: (p) => tmdb.animeTrending(p),                  mediaType: "tv"    },
  "Bingeworthy TV Shows":                                  { kind: "tmdb", fn: (p) => tmdb.bingeworthyTV(p),                  mediaType: "tv"    },
  "Critically Acclaimed US TV Dramas":                     { kind: "tmdb", fn: (p) => tmdb.criticallyAcclaimedUSDramas(p),    mediaType: "tv"    },
  "Romantic TV Shows":                                     { kind: "tmdb", fn: (p) => tmdb.romanticTVShows(p),                mediaType: "tv"    },
  "Movies & TV Shows Dubbed in Telugu":                    { kind: "tmdb", fn: (p) => tmdb.teluguContent(p),                  mediaType: "tv"    },
  "Erase My Memory So I Can Watch Again":                  { kind: "tmdb", fn: (p) => tmdb.eraseMyMemory(p),                  mediaType: "tv"    },
  "Swoonworthy Romance":                                   { kind: "tmdb", fn: (p) => tmdb.swoonworthyRomance(p),             mediaType: "tv"    },
  "WWE: Live and Upcoming":                                { kind: "tmdb", fn: (p) => tmdb.wweSports(p),                      mediaType: "tv"    },
  "TV Sci-Fi & Horror":                                    { kind: "tmdb", fn: (p) => tmdb.sciFiHorrorTV(p),                  mediaType: "tv"    },
  "Japanese TV Shows":                                     { kind: "tmdb", fn: (p) => tmdb.japaneseTVShows(p),                mediaType: "tv"    },
  "Crowd Pleasers":                                        { kind: "tmdb", fn: (p) => tmdb.crowdPleasers(p),                  mediaType: "tv"    },
  "Get in on the action":                                  { kind: "tmdb", fn: (p) => tmdb.getInOnAction(p),                  mediaType: "tv"    },
  "Get In on the Action":                                  { kind: "tmdb", fn: (p) => tmdb.actionAdventureMovies(p),          mediaType: "movie" },
  "Top 10 Shows in India Today":                           { kind: "tmdb", fn: (p) => tmdb.top10TrendingShowsIndia(p),        mediaType: "tv"    },
  "Top 10 Movie India":                                    { kind: "tmdb", fn: (p) => tmdb.top10MoviesIndia(p),               mediaType: "movie" },
  "Because you liked":                                     { kind: "tmdb", fn: (p) => tmdb.becauseYouLiked(p),               mediaType: "tv"    },
  "Because You Watched":                                   { kind: "tmdb", fn: (p) => tmdb.becauseYouWatched(p),             mediaType: "tv"    },
  "Dreams to you":                                         { kind: "tmdb", fn: (p) => tmdb.dreamsToYou(p),                   mediaType: "tv"    },
  "Only On Netflix shows":                                 { kind: "tmdb", fn: (p) => tmdb.onlyOnNetflix(p),                 mediaType: "tv"    },
  "Top 5 show by Netflix Korean":                          { kind: "tmdb", fn: (p) => tmdb.top5NetflixKorean(p),             mediaType: "tv"    },
  "Top 10 show in Korea":                                  { kind: "tmdb", fn: (p) => tmdb.koreanDramas(p),                   mediaType: "tv" },
  "Made in Korea":                                         { kind: "tmdb", fn: (p) => tmdb.madeInKorea(p),                    mediaType: "tv"    },
  "made in India":                                         { kind: "tmdb", fn: (p) => tmdb.madeInIndia(p),                    mediaType: "tv"    },
  "Korean TV Shows":                                       { kind: "tmdb", fn: (p) => tmdb.koreanDramas(p),                   mediaType: "tv" },
  "New on Netflix":                                        { kind: "tmdb", fn: (p) => tmdb.newOnNetflix(p),                    mediaType: "tv"    },
  "Asian TV Shows":                                        { kind: "tmdb", fn: (p) => tmdb.asianTVShows(p),                    mediaType: "tv"    },
  "Korean TV Action & Adventure":                          { kind: "tmdb", fn: (p) => tmdb.koreanActionTV(p),                 mediaType: "tv"    },
  "Anime Series":                                          { kind: "tmdb", fn: (p) => tmdb.animeSeries(p),                    mediaType: "tv"    },
  "Indian Movies":                                         { kind: "tmdb", fn: (p) => tmdb.indianMovies(p),                   mediaType: "movie" },
  "Romantic Indian movies":                                { kind: "tmdb", fn: (p) => tmdb.romanticIndianMovies(p),           mediaType: "movie" },
  "Desi & chil":                                           { kind: "tmdb", fn: (p) => tmdb.desiAndChill(p),                   mediaType: "tv"    },
  "Romantic Comedies":                                     { kind: "tmdb", fn: (p) => tmdb.romanticComedies(p),                mediaType: "movie" },
  "US Movies dubbed in Hindi":                             { kind: "tmdb", fn: (p) => tmdb.usMoviesDubbedInHindi(p),          mediaType: "movie" },
  "Top 10 Movies Worldwide Today":                         { kind: "tmdb", fn: (p) => tmdb.top10ShowsAllCountries(p),          mediaType: "tv"    },
  "Highest Rated Series":                                  { kind: "tmdb", fn: (p) => tmdb.netflixTV({ sort_by: "vote_average.desc", "vote_count.gte": 100 })(p), mediaType: "tv" },
  "Recently Added":                                        { kind: "tmdb", fn: (p) => tmdb.newOnNetflix(p),                    mediaType: "tv"    },
  "Love at First Sight":                                   { kind: "tmdb", fn: (p) => tmdb.netflixTV({ with_genres: "10749,18" })(p), mediaType: "tv" },
  "Only Here on S Movie Original":                         { kind: "tmdb", fn: (p) => tmdb.netflixMovie({ sort_by: "vote_average.desc", "vote_average.gte": 7 })(p), mediaType: "movie" },
  "One-Night Binge":                                       { kind: "tmdb", fn: (p) => tmdb.netflixTV({ with_genres: "35,18", "vote_average.gte": 7 })(p), mediaType: "tv" },
  "S-MOVIE Coming Soon":                                    { kind: "tmdb", fn: (p) => tmdb.upcoming(p),                       mediaType: "movie" },
  "Even If This Love Disappears from the World Tonight":  { kind: "tmdb", fn: (p) => tmdb.netflixTV({ with_genres: "10749,18", with_origin_country: "JP|KR" })(p), mediaType: "tv" },
  "If You Liked True Beauty":                              { kind: "tmdb", fn: (p) => tmdb.netflixTV({ with_origin_country: "KR", with_genres: "10749,18" })(p), mediaType: "tv" },
  "My Royal Nemesis":                                      { kind: "tmdb", fn: (p) => tmdb.netflixTV({ with_origin_country: "KR", with_genres: "10749,18" })(p), mediaType: "tv" },
  "Sold Out on You":                                       { kind: "tmdb", fn: (p) => tmdb.netflixTV({ with_genres: "10749,35" })(p), mediaType: "tv" },

  // Shows tab — existing sections ────────────────────────────────────────────
  "From K-Pop to K-Dramas (Shows)":               { kind: "tmdb", fn: (p) => tmdb.koreanDramas(p),             mediaType: "tv"    },
  "Supernatural soaps":                            { kind: "tmdb", fn: (p) => tmdb.scifiFantasyTV(p),           mediaType: "tv"    },
  "Top Searches":                                  { kind: "tmdb", fn: (p) => tmdb.trendingToday(p),            mediaType: "movie" },
  "Horror TV Series":                              { kind: "tmdb", fn: (p) => tmdb.discover("tv", 27, p),       mediaType: "tv"    },
  "TV Mysteries":                                  { kind: "tmdb", fn: (p) => tmdb.discover("tv", 9648, p),     mediaType: "tv"    },
  // Movies tab ─────────────────────────────────────────────
  "New Releases":                                  { kind: "tmdb", fn: (p) => tmdb.nowPlaying(p),               mediaType: "movie" },
  "South Indian Hits":                             { kind: "hdhub", fn: (p) => hdhub.search("South", p)        },
  "Bollywood Hits":                                { kind: "hdhub", fn: (p) => hdhub.search("Bollywood", p)    },
  "Dual Audio":                                    { kind: "hdhub", fn: (p) => hdhub.search("Dual Audio", p)   },
  // Categories tab ─────────────────────────────────────────
  "Action & Adventure":                            { kind: "tmdb", fn: (p) => tmdb.discover("movie", 28, p),    mediaType: "movie" },
  "Crime & Thriller":                              { kind: "tmdb", fn: (p) => tmdb.discover("movie", 80, p),    mediaType: "movie" },
  "Sci-Fi & Fantasy":                              { kind: "tmdb", fn: (p) => tmdb.scifiFantasyTV(p),           mediaType: "tv"    },
  "Romance & Drama":                               { kind: "tmdb", fn: (p) => tmdb.discover("movie", 10749, p), mediaType: "movie" },
  "Horror":                                        { kind: "tmdb", fn: (p) => tmdb.discover("movie", 27, p),    mediaType: "movie" },
  "Comedy":                                        { kind: "tmdb", fn: (p) => tmdb.discover("movie", 35, p),    mediaType: "movie" },
  "Animation":                                     { kind: "tmdb", fn: (p) => tmdb.discover("tv", 16, p),       mediaType: "tv"    },
  "Documentary":                                   { kind: "tmdb", fn: (p) => tmdb.discover("movie", 99, p),    mediaType: "movie" },
  "Korean Dramas":                                 { kind: "tmdb", fn: (p) => tmdb.koreanDramas(p),             mediaType: "tv"    },
  "Award Winners":                                 { kind: "tmdb", fn: (p) => tmdb.awardWinningTV(p),           mediaType: "tv"    },
  // Anime rows ─────────────────────────────────────────────────────────────────
  "Trending Anime":                                { kind: "tmdb", fn: (p) => tmdb.animeTrending(p),            mediaType: "tv"    },
  "Anime Movies":                                  { kind: "tmdb", fn: (p) => tmdb.animeMovies(p),              mediaType: "movie" },
  "Top Rated Anime":                               { kind: "tmdb", fn: (p) => tmdb.animeTopRated(p),            mediaType: "tv"    },
  "New Anime This Season":                         { kind: "tmdb", fn: (p) => tmdb.animeNewSeason(p),           mediaType: "tv"    },
  "Action Anime":                                  { kind: "tmdb", fn: (p) => tmdb.animeAction(p),              mediaType: "tv"    },
  // Hindi content rows ──────────────────────────────────────────────────────────
  "Hindi Blockbusters":                            { kind: "tmdb", fn: (p) => tmdb.hindiMovies(p),              mediaType: "movie" },
  "Popular Hindi Shows":                           { kind: "tmdb", fn: (p) => tmdb.hindiShows(p),               mediaType: "tv"    },
  "Hindi Thrillers":                               { kind: "tmdb", fn: (p) => tmdb.hindiThrillers(p),           mediaType: "movie" },
  "Hindi Classics":                                { kind: "tmdb", fn: (p) => tmdb.hindiTopRated(p),            mediaType: "movie" },
};

// Keep the category detail screen in sync with the Home screen automatically.
// This also covers duplicate display labels and any newly added Home rows.
for (const category of HOME_CATEGORIES) {
  if (category.kind === "special" || ROW_FETCHERS[category.title]) continue;
  ROW_FETCHERS[category.title] = {
    kind: "tmdb",
    fn: category.fetcher,
    mediaType: category.mediaType,
  };
}

export function mapTMDBToCards(page: TMDBPage, defaultMediaType: "movie" | "tv"): SeeAllCard[] {
  return page.results
    .filter((m) => m.poster_path)
    .map((m) => {
      const card = tmdbToCard(m);
      const posterUri = (card.poster as { uri?: string })?.uri ?? "";
      return {
        id: String(m.id),
        title: card.title,
        posterUri,
        mediaType: (
          m.media_type === "tv" ? "tv" :
          m.media_type === "movie" ? "movie" :
          defaultMediaType
        ) as "movie" | "tv",
      };
    })
    .filter((c) => Boolean(c.posterUri));
}

export function mapHDHubToCards(items: HDHubMovie[]): SeeAllCard[] {
  return items.map((h) => ({
    id: `hdhub-${h.id}`,
    title: h.title,
    posterUri: proxyUrl(h.poster) || h.poster,
    mediaType: "movie" as const,
    hdhubUrl: h.url,
  }));
}
