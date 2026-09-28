import type { Movie } from "@/data/movies";
import type { TMDBDetail } from "@/lib/tmdb";
import type { TitleMetadataRowData } from "@/components/TitleMetadataRow";

type TitleMetadataInput = {
  movie?: Movie | null;
  detail?: TMDBDetail | null;
  isTV: boolean;
  certification?: string | null;
  episodeCount?: number;
};

function meaningful(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized && normalized !== "—" && normalized !== "-" ? normalized : null;
}

function parseRuntime(value?: string | null): number | null {
  const raw = meaningful(value);
  if (!raw) return null;
  const hours = raw.match(/(\d+)\s*h/i);
  const minutes = raw.match(/(\d+)\s*m/i);
  if (!hours && !minutes) return null;
  return Number(hours?.[1] ?? 0) * 60 + Number(minutes?.[1] ?? 0);
}

function formatRuntime(minutes?: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours > 0) return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
  return `${minutes}m`;
}

function formatCount(value?: number | null, singular = "Season", plural = "Seasons"): string | null {
  if (!value || value <= 0) return null;
  return `${value} ${value === 1 ? singular : plural}`;
}

function parseCatalogCount(
  value: string | null | undefined,
  singular: string,
  plural: string,
): string | null {
  const raw = meaningful(value);
  if (!raw) return null;
  const match = raw.match(new RegExp(`(\\d+)\\s*${singular}s?`, "i"));
  const count = match ? Number(match[1]) : 0;
  return formatCount(count, singular, plural);
}

function getYear(movie?: Movie | null, detail?: TMDBDetail | null): string | null {
  const source = detail?.release_date ?? detail?.first_air_date;
  const fromDetail = source?.slice(0, 4);
  if (fromDetail && /^\d{4}$/.test(fromDetail)) return fromDetail;
  return movie?.year && movie.year > 0 ? String(movie.year) : null;
}

function getEpisodeCount(detail?: TMDBDetail | null, fallback?: number): number | null {
  if (detail?.number_of_episodes && detail.number_of_episodes > 0) {
    return detail.number_of_episodes;
  }
  const fromSeasons = detail?.seasons?.reduce(
    (total, season) => total + (season.episode_count || 0),
    0,
  );
  return fromSeasons && fromSeasons > 0 ? fromSeasons : fallback && fallback > 0 ? fallback : null;
}

export function buildTitleMetadata({
  movie,
  detail,
  isTV,
  certification,
  episodeCount,
}: TitleMetadataInput): TitleMetadataRowData {
  const capabilities = movie?.metadata;
  const durationFromCatalog = meaningful(movie?.duration);
  const isLimitedSeries =
    isTV &&
    Boolean(
      capabilities?.limitedSeries ||
        detail?.type?.toLowerCase() === "miniseries" ||
        /limited[\s-]*series|miniseries/i.test(durationFromCatalog ?? ""),
    );

  let contentLabel: string | null = null;
  if (isTV) {
    contentLabel = isLimitedSeries
      ? "Limited Series"
      : formatCount(detail?.number_of_seasons ?? movie?.seasons);
    if (!contentLabel) {
      contentLabel = parseCatalogCount(movie?.duration, "Season", "Seasons");
    }
    if (!contentLabel) {
      contentLabel = formatCount(getEpisodeCount(detail, episodeCount), "Episode", "Episodes");
    }
  } else {
    contentLabel = formatRuntime(detail?.runtime ?? parseRuntime(durationFromCatalog));
    if (!contentLabel && durationFromCatalog && !/\bseason|episode|limited series\b/i.test(durationFromCatalog)) {
      contentLabel = durationFromCatalog;
    }
  }

  return {
    year: getYear(movie, detail),
    ageRating: meaningful(certification) ?? meaningful(movie?.rating),
    contentLabel,
    quality: meaningful(capabilities?.quality),
    spatialAudio: capabilities?.spatialAudio === true,
    audioDescription: capabilities?.audioDescription === true,
    subtitles: capabilities?.subtitles === true || capabilities?.closedCaptions === true,
  };
}

export type TitleAnnouncement = {
  type: "next-season" | "next-episode" | "final-season";
  airDate?: string | null;
  year?: number | null;
};

export function getTitleAnnouncement(
  movie: Movie | null | undefined,
  detail: TMDBDetail | null | undefined,
  isTV: boolean,
): TitleAnnouncement | null {
  if (!isTV) return null;

  const configured = movie?.metadata?.announcement;
  if (configured?.type) {
    return {
      type: configured.type,
      airDate: configured.airDate,
      year: configured.year,
    };
  }

  if (detail?.next_episode_to_air?.air_date) {
    return {
      type: "next-episode",
      airDate: detail.next_episode_to_air.air_date,
    };
  }

  if (detail?.status === "Returning Series") {
    return { type: "next-season" };
  }

  return null;
}

export function formatTitleAnnouncement(
  announcement: TitleAnnouncement | null,
): string | null {
  if (!announcement) return null;

  if (announcement.type === "next-season") {
    return "It's official: Another season is coming";
  }

  if (announcement.type === "final-season") {
    const year = announcement.year;
    return year ? `Final Season ${year}` : "Final Season";
  }

  if (!announcement.airDate) return null;
  const date = new Date(`${announcement.airDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const day = new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(date);
  return `New episode coming on ${day}`;
}