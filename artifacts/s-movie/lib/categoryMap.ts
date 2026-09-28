/**
 * Home screen category map — single source of truth for the 102 architecture rows.
 *
 * Netflix-Style AI Algorithm (Permanent Architecture):
 *  • ALL content rows filter by Netflix (with_networks=213 for TV, watch_provider=8 for movies)
 *    so only Netflix titles appear in every category.
 *  • Recommendation rows (/recommendations endpoint) and TMDB curated lists cannot be
 *    network-filtered by the API — they remain as-is.
 *  • Gemini AI re-sorts Trending and "Because you liked" rows (see geminiRowId in index.tsx).
 *  • Poster rotation uses 24-hour rotation_key + AsyncStorage locking (see posterAlgorithm.ts).
 *
 * imageMode:
 *  "poster"   → tall portrait 2:3 card (default)
 *  "backdrop" → wide landscape crop (action, thriller, sci-fi, blockbusters)
 */
import { tmdb, type TMDBPage } from "@/lib/tmdb";
import type { ImageMode } from "@/components/MovieRow";

export type HomeCategory =
  | {
      kind:      "movieRow";
      title:     string;
      fetcher:   (page: number) => Promise<TMDBPage>;
      mediaType: "movie" | "tv";
      imageMode: ImageMode;
    }
  | {
      kind:      "top10";
      title:     string;
      fetcher:   (page: number) => Promise<TMDBPage>;
      mediaType: "movie" | "tv";
    }
  | {
      kind: "special";
      key:  "continueWatching" | "myList" | "topPicksForYou";
      title: string;
    };

// ─── Home rows — ordered exactly as displayed on the Home screen ────────────────
export const HOME_CATEGORIES: HomeCategory[] = [
  { kind: "movieRow", title: "Trending Now", fetcher: tmdb.netflixTV(), mediaType: "tv", imageMode: "backdrop" },
  { kind: "movieRow", title: "Meet Your Next Binge", fetcher: tmdb.netflixTV({ "vote_average.gte": 7.5, "vote_count.gte": 100 }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Your Next Watch", fetcher: tmdb.netflixTV(), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Korean TV Shows", fetcher: tmdb.koreanDramas, mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Romantic Shows", fetcher: tmdb.netflixTV({ with_genres: 10749 }), mediaType: "tv", imageMode: "poster" },
  { kind: "top10", title: "Top 10 Movies in India Today", fetcher: tmdb.top10MoviesIndia, mediaType: "movie" },
  { kind: "special", key: "continueWatching", title: "Continue watching" },
  { kind: "movieRow", title: "We Think You'll Love These", fetcher: tmdb.netflixTV({ "vote_average.gte": 7.5, "vote_count.gte": 50 }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Made in Korea", fetcher: tmdb.madeInKorea, mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "It's Okay to Not Be Okay", fetcher: tmdb.tvRecommendations(95639), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Top 10 show in Korea", fetcher: tmdb.koreanDramas, mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Because you liked", fetcher: tmdb.netflixTV({ with_origin_country: "KR", with_genres: "10749,18" }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Romantic East Asian TV Shows", fetcher: tmdb.netflixTV({ with_origin_country: "KR|JP|CN|TW", with_genres: 10749 }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Get in on the action", fetcher: tmdb.netflixTV({ with_genres: 10759 }), mediaType: "tv", imageMode: "backdrop" },
  { kind: "movieRow", title: "New Releases", fetcher: tmdb.netflixMovie({ sort_by: "primary_release_date.desc" }), mediaType: "movie", imageMode: "backdrop" },
  { kind: "movieRow", title: "First Love Romance", fetcher: tmdb.netflixTV({ with_genres: 10749 }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "K-Dramas", fetcher: tmdb.koreanDramas, mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Do You Like Brahms", fetcher: tmdb.tvRecommendations(102922), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Emotional Movie", fetcher: tmdb.netflixMovie({ with_genres: 18, "vote_average.gte": 7 }), mediaType: "movie", imageMode: "poster" },
  { kind: "movieRow", title: "Eye Candy", fetcher: tmdb.netflixMovie({ sort_by: "popularity.desc", "vote_average.gte": 7 }), mediaType: "movie", imageMode: "poster" },
  { kind: "movieRow", title: "New on Netflix", fetcher: tmdb.newOnNetflix, mediaType: "tv", imageMode: "backdrop" },
  { kind: "movieRow", title: "US TV Shows", fetcher: tmdb.netflixTV({ with_origin_country: "US" }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Critically Acclaimed TV Shows", fetcher: tmdb.netflixTV({ "vote_average.gte": 8, "vote_count.gte": 1000 }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Love language", fetcher: tmdb.netflixTV({ with_genres: "10749,18" }), mediaType: "tv", imageMode: "poster" },
  { kind: "special", key: "myList", title: "My List" },
  { kind: "movieRow", title: "Downloads For You", fetcher: tmdb.netflixTV({ with_original_language: "hi" }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Asian TV Shows", fetcher: tmdb.asianTVShows, mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Can this love be traslated", fetcher: tmdb.netflixTV({ with_genres: 10749, with_original_language: "ko|ja|zh|fr|es" }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Fantasy TV Shows", fetcher: tmdb.netflixTV({ with_genres: 10765 }), mediaType: "tv", imageMode: "backdrop" },
  { kind: "movieRow", title: "Made in Korea", fetcher: tmdb.koreanDramas, mediaType: "tv", imageMode: "poster" },
  { kind: "top10", title: "Top 10 Shows in India Today", fetcher: tmdb.top10TrendingShowsIndia, mediaType: "tv" },
  { kind: "movieRow", title: "Hidden Gems", fetcher: tmdb.netflixMovie({ "vote_average.gte": 7, "vote_count.gte": 20 }), mediaType: "movie", imageMode: "poster" },
  { kind: "movieRow", title: "Romantic International Opposites-Attract TV Dramas", fetcher: tmdb.netflixTV({ with_genres: "10749,35" }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Because You Watched The East", fetcher: tmdb.tvRecommendations(225543), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Mysteries Dramas", fetcher: tmdb.netflixTV({ with_genres: "9648,18" }), mediaType: "tv", imageMode: "backdrop" },
  { kind: "movieRow", title: "US TV Comedies", fetcher: tmdb.netflixTV({ with_origin_country: "US", with_genres: 35 }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Because you watched The Palace", fetcher: tmdb.tvRecommendations(111050), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Popular on Stream", fetcher: tmdb.netflixMovie(), mediaType: "movie", imageMode: "backdrop" },
  { kind: "movieRow", title: "Suspenseful TV Shows", fetcher: tmdb.netflixTV({ with_genres: "53,9648" }), mediaType: "tv", imageMode: "backdrop" },
  { kind: "movieRow", title: "Korean TV Dramas", fetcher: tmdb.koreanDramas, mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Romantic International TV Comedies", fetcher: tmdb.netflixTV({ with_genres: "10749,35" }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Korean TV Action & Adventure", fetcher: tmdb.koreanActionTV, mediaType: "tv", imageMode: "backdrop" },
  { kind: "movieRow", title: "Mind-Bending Stories", fetcher: tmdb.netflixMovie({ with_genres: "878,9648" }), mediaType: "movie", imageMode: "backdrop" },
  { kind: "movieRow", title: "Familiar Favourite Series", fetcher: tmdb.netflixTV({ "vote_average.gte": 7.5, "vote_count.gte": 50 }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Asian Movies & TV", fetcher: tmdb.netflixTV({ with_origin_country: "JP|KR|CN|TH|IN|HK|TW" }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "made in India", fetcher: tmdb.madeInIndia, mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Psychological Thrillers", fetcher: tmdb.netflixMovie({ with_genres: "53,9648" }), mediaType: "movie", imageMode: "backdrop" },
  { kind: "movieRow", title: "Anime", fetcher: tmdb.netflixTV({ with_genres: 16, with_original_language: "ja" }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Bingeworthy TV Shows", fetcher: tmdb.netflixTV({ "vote_average.gte": 7.5 }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Dreams to you", fetcher: tmdb.netflixTV({ with_genres: "10749,14" }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Critically Acclaimed US TV Dramas", fetcher: tmdb.netflixTV({ with_origin_country: "US", with_genres: 18, "vote_average.gte": 8.2 }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Coming of Age", fetcher: tmdb.netflixMovie({ with_genres: "18,14" }), mediaType: "movie", imageMode: "poster" },
  { kind: "movieRow", title: "Everyone's Watching", fetcher: tmdb.netflixMovie({ sort_by: "popularity.desc" }), mediaType: "movie", imageMode: "backdrop" },
  { kind: "movieRow", title: "Movies & TV Shows Dubbed in Telugu", fetcher: tmdb.netflixTV({ with_original_language: "te" }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Global Top Picks", fetcher: tmdb.netflixMovie(), mediaType: "movie", imageMode: "backdrop" },
  { kind: "movieRow", title: "Erase My Memory So I Can Watch Again", fetcher: tmdb.netflixTV({ "vote_average.gte": 7.5, "vote_count.gte": 50 }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Swoonworthy Romance", fetcher: tmdb.netflixTV({ with_genres: "10749,35" }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "TV Sci-Fi & Horror", fetcher: tmdb.netflixTV({ with_genres: "10765,27" }), mediaType: "tv", imageMode: "backdrop" },
  { kind: "movieRow", title: "Crowd Pleasers", fetcher: tmdb.netflixTV({ with_genres: "10759,80,53" }), mediaType: "tv", imageMode: "backdrop" },
  { kind: "movieRow", title: "Only On Netflix shows", fetcher: tmdb.onlyOnNetflix, mediaType: "tv", imageMode: "backdrop" },
  { kind: "movieRow", title: "Kids & Family", fetcher: tmdb.netflixMovie({ with_genres: 10751 }), mediaType: "movie", imageMode: "poster" },
  { kind: "movieRow", title: "Get In on the Action", fetcher: tmdb.netflixMovie({ with_genres: "28,12" }), mediaType: "movie", imageMode: "backdrop" },
  { kind: "top10", title: "Top 10 Movie India", fetcher: tmdb.top10MoviesIndia, mediaType: "movie" },
  { kind: "movieRow", title: "Blockbuster Movies", fetcher: tmdb.netflixMovie(), mediaType: "movie", imageMode: "backdrop" },
  { kind: "movieRow", title: "Late Night Watch", fetcher: tmdb.netflixMovie({ with_genres: "27,53" }), mediaType: "movie", imageMode: "backdrop" },
  { kind: "movieRow", title: "IMDb Top Rated", fetcher: tmdb.netflixMovie({ sort_by: "vote_average.desc", "vote_count.gte": 50 }), mediaType: "movie", imageMode: "backdrop" },
  { kind: "movieRow", title: "Leaving Soon", fetcher: tmdb.netflixMovie(), mediaType: "movie", imageMode: "poster" },
  { kind: "movieRow", title: "Top 5 show by Netflix Korean", fetcher: tmdb.top5NetflixKorean, mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Only On S-Movie original", fetcher: tmdb.netflixMovie({ sort_by: "vote_average.desc", "vote_average.gte": 7 }), mediaType: "movie", imageMode: "backdrop" },
  { kind: "movieRow", title: "Anime Series", fetcher: tmdb.animeSeries, mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Dream to you", fetcher: tmdb.netflixTV({ with_genres: "10749,14" }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Indian Movies", fetcher: tmdb.indianMovies, mediaType: "movie", imageMode: "poster" },
  { kind: "movieRow", title: "Romantic Indian movies", fetcher: tmdb.romanticIndianMovies, mediaType: "movie", imageMode: "poster" },
  { kind: "movieRow", title: "Desi & chill", fetcher: tmdb.desiAndChill, mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "A Piece of Your Mind", fetcher: tmdb.tvRecommendations(99024), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "The Lonely and Great God", fetcher: tmdb.tvRecommendations(68865), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Sweet home", fetcher: tmdb.tvRecommendations(109545), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Our Beloved Summer", fetcher: tmdb.tvRecommendations(123249), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "When the Weather is Fine", fetcher: tmdb.tvRecommendations(96821), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "When Life Gives You Tangerines", fetcher: tmdb.tvRecommendations(280648), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Twenty-Five Twenty-One", fetcher: tmdb.tvRecommendations(159155), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Lovely Runner", fetcher: tmdb.tvRecommendations(237811), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Romantic Comedies", fetcher: tmdb.romanticComedies, mediaType: "movie", imageMode: "poster" },
  { kind: "movieRow", title: "US Movies dubbed in Hindi", fetcher: tmdb.usMoviesDubbedInHindi, mediaType: "movie", imageMode: "poster" },
  { kind: "movieRow", title: "Alice in borderland", fetcher: tmdb.tvRecommendations(108545), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Romantic Indian Dramas:", fetcher: (p) => tmdb.list(4729, p), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Classics:", fetcher: tmdb.netflixClassics, mediaType: "movie", imageMode: "backdrop" },
  { kind: "movieRow", title: "Children & Family Films:", fetcher: (p) => tmdb.list(783, p), mediaType: "movie", imageMode: "poster" },
  { kind: "movieRow", title: "Sci-Fi & Fantasy:", fetcher: (p) => tmdb.list(1492, p), mediaType: "movie", imageMode: "backdrop" },
  { kind: "movieRow", title: "Thrillers:", fetcher: (p) => tmdb.list(8933, p), mediaType: "movie", imageMode: "backdrop" },
  { kind: "movieRow", title: "Top 10 Movies Worldwide Today", fetcher: tmdb.top10MoviesWorldwide, mediaType: "movie", imageMode: "poster" },
  { kind: "movieRow", title: "Highest Rated Series", fetcher: tmdb.netflixTV({ sort_by: "vote_average.desc", "vote_count.gte": 100 }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Recently Added", fetcher: tmdb.newOnNetflix, mediaType: "tv", imageMode: "backdrop" },
  { kind: "movieRow", title: "Love at First Sight", fetcher: tmdb.netflixTV({ with_genres: "10749,18" }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Only Here on S Movie Original", fetcher: tmdb.netflixMovie({ sort_by: "vote_average.desc", "vote_average.gte": 7 }), mediaType: "movie", imageMode: "backdrop" },
  { kind: "movieRow", title: "One-Night Binge", fetcher: tmdb.netflixTV({ with_genres: "35,18", "vote_average.gte": 7 }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "S-MOVIE Coming Soon", fetcher: tmdb.netflixUpcoming, mediaType: "movie", imageMode: "backdrop" },
  { kind: "movieRow", title: "Trending Anime", fetcher: tmdb.animeTrending, mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Even If This Love Disappears from the World Tonight", fetcher: tmdb.netflixTV({ with_genres: "10749,18", with_origin_country: "JP|KR" }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "If You Liked True Beauty", fetcher: tmdb.netflixTV({ with_origin_country: "KR", with_genres: "10749,18" }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "My Royal Nemesis", fetcher: tmdb.netflixTV({ with_genres: "10749,35", with_origin_country: "KR" }), mediaType: "tv", imageMode: "poster" },
  { kind: "movieRow", title: "Sold Out on You", fetcher: tmdb.netflixTV({ with_genres: "10749,35", with_origin_country: "KR" }), mediaType: "tv", imageMode: "poster" },
];
