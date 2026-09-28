import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  deleteDownload,
  downloadVideo,
  getDownloadRecord,
  listDownloads,
  type DownloadRecord,
  type DownloadStatus,
} from "@/lib/downloads";

const META_STORAGE_KEY = "smovie_dl_meta_v1";

export interface DownloadMeta {
  movieId: string;
  title: string;
  posterUri?: string | null;
  year?: number;
}

export interface ManagedDownload extends DownloadMeta {
  status: DownloadStatus;
  progress: number;
  sizeBytes: number;
  downloadedAt?: number;
  localPath?: string;
}

interface DownloadContextValue {
  downloads: ManagedDownload[];
  downloadingCount: number;
  startDownload: (
    meta: DownloadMeta,
    remoteUrl: string,
    onProgress?: (p: number) => void,
  ) => Promise<void>;
  removeDownload: (movieId: string) => Promise<void>;
  getDownload: (movieId: string) => ManagedDownload | null;
  refreshDownloads: () => Promise<void>;
}

const DownloadContext = createContext<DownloadContextValue>({
  downloads: [],
  downloadingCount: 0,
  startDownload: async () => {},
  removeDownload: async () => {},
  getDownload: () => null,
  refreshDownloads: async () => {},
});

async function loadMeta(): Promise<Record<string, DownloadMeta>> {
  try {
    const raw = await AsyncStorage.getItem(META_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveMeta(data: Record<string, DownloadMeta>): Promise<void> {
  try {
    await AsyncStorage.setItem(META_STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

async function fetchTmdbMeta(movieId: string): Promise<Partial<DownloadMeta>> {
  try {
    const numId = movieId.replace(/\D/g, "");
    if (!numId) return {};
    const data = await (await import("@/lib/tmdb")).tmdbGet<{
      title?: string;
      original_title?: string;
      poster_path?: string | null;
      release_date?: string;
    }>(`/movie/${numId}`, { language: "en-US" });
    return {
      title: data.title ?? data.original_title,
      posterUri: data.poster_path
        ? `https://wsrv.nl/?url=${encodeURIComponent(`https://image.tmdb.org/t/p/w500${data.poster_path}`)}&output=webp&q=85`
        : null,
      year: data.release_date ? parseInt(data.release_date.slice(0, 4)) : undefined,
    };
  } catch {
    return {};
  }
}

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [downloads, setDownloads] = useState<ManagedDownload[]>([]);
  const activeProgress = useRef<Record<string, number>>({});
  const activeStatus = useRef<Record<string, DownloadStatus>>({});

  const buildList = useCallback(
    async (meta: Record<string, DownloadMeta>): Promise<ManagedDownload[]> => {
      const completed = await listDownloads();
      const completedMap: Record<string, DownloadRecord> = {};
      for (const r of completed) completedMap[r.movieId] = r;

      const allIds = new Set([
        ...Object.keys(completedMap),
        ...Object.keys(activeProgress.current),
      ]);

      const result: ManagedDownload[] = [];
      for (const id of allIds) {
        const m = meta[id] ?? { movieId: id, title: id };
        const rec = completedMap[id];
        const progress = activeProgress.current[id] ?? rec?.progress ?? 0;
        const status: DownloadStatus =
          activeStatus.current[id] ??
          rec?.status ??
          "idle";
        result.push({
          ...m,
          movieId: id,
          status,
          progress,
          sizeBytes: rec?.sizeBytes ?? 0,
          downloadedAt: rec?.downloadedAt,
          localPath: rec?.localPath,
        });
      }

      result.sort((a, b) => {
        if (a.status === "downloading" && b.status !== "downloading") return -1;
        if (b.status === "downloading" && a.status !== "downloading") return 1;
        return (b.downloadedAt ?? 0) - (a.downloadedAt ?? 0);
      });

      return result;
    },
    [],
  );

  const refreshDownloads = useCallback(async () => {
    const meta = await loadMeta();
    const list = await buildList(meta);
    setDownloads(list);
  }, [buildList]);

  useEffect(() => {
    refreshDownloads();
  }, [refreshDownloads]);

  const startDownload = useCallback(
    async (
      meta: DownloadMeta,
      remoteUrl: string,
      onProgress?: (p: number) => void,
    ) => {
      const { movieId } = meta;

      const existing = await getDownloadRecord(movieId);
      if (existing?.status === "complete") return;

      const metaMap = await loadMeta();
      if (!metaMap[movieId]) {
        let enriched = meta;
        const tmdb = await fetchTmdbMeta(movieId);
        enriched = { ...meta, ...tmdb };
        metaMap[movieId] = enriched;
        await saveMeta(metaMap);
      }

      activeStatus.current[movieId] = "downloading";
      activeProgress.current[movieId] = 0;
      await refreshDownloads();

      try {
        await downloadVideo(movieId, remoteUrl, async (p) => {
          activeProgress.current[movieId] = p;
          onProgress?.(p);
          const updatedMeta = await loadMeta();
          const list = await buildList(updatedMeta);
          setDownloads(list);
        });
        activeStatus.current[movieId] = "complete";
        delete activeProgress.current[movieId];

        const completedMeta = await loadMeta();
        const completedRec = await getDownloadRecord(movieId);
        if (completedRec && completedMeta[movieId]) {
          completedMeta[movieId] = { ...completedMeta[movieId] };
          await saveMeta(completedMeta);
        }
      } catch (error) {
        activeStatus.current[movieId] = "error";
        delete activeProgress.current[movieId];
        throw error;
      } finally {
        await refreshDownloads();
      }
    },
    [buildList, refreshDownloads],
  );

  const removeDownload = useCallback(
    async (movieId: string) => {
      await deleteDownload(movieId);
      const metaMap = await loadMeta();
      delete metaMap[movieId];
      await saveMeta(metaMap);
      delete activeProgress.current[movieId];
      delete activeStatus.current[movieId];
      await refreshDownloads();
    },
    [refreshDownloads],
  );

  const getDownload = useCallback(
    (movieId: string): ManagedDownload | null => {
      return downloads.find((d) => d.movieId === movieId) ?? null;
    },
    [downloads],
  );

  const downloadingCount = downloads.filter(
    (d) => d.status === "downloading",
  ).length;

  return (
    <DownloadContext.Provider
      value={{
        downloads,
        downloadingCount,
        startDownload,
        removeDownload,
        getDownload,
        refreshDownloads,
      }}
    >
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownloads() {
  return useContext(DownloadContext);
}
