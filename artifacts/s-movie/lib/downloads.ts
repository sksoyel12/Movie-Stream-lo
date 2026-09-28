import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";

export type DownloadStatus = "idle" | "downloading" | "complete" | "error";

export type DownloadRecord = {
  movieId: string;
  localPath: string;
  status: DownloadStatus;
  progress: number; // 0-1
  sizeBytes: number;
  downloadedAt?: number;
};

const STORAGE_KEY = "smovie_downloads_v2";

/** Embed pages can be watched, but they are not downloadable video files. */
export function isDirectVideoUrl(remoteUrl: string): boolean {
  try {
    const parsed = new URL(remoteUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const path = parsed.pathname.toLowerCase();
    return !(
      path.includes("/embed") ||
      path.endsWith(".php") ||
      path.includes("/movie/") ||
      path.includes("/tv/")
    );
  } catch {
    return false;
  }
}

function getDownloadDir(): Directory {
  return new Directory(Paths.document, "smovie_downloads");
}

function getLocalFile(movieId: string): File {
  const name = movieId.replace(/[^a-z0-9_-]/gi, "_") + ".mp4";
  return new File(getDownloadDir(), name);
}

async function loadAll(): Promise<Record<string, DownloadRecord>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, DownloadRecord>) : {};
  } catch {
    return {};
  }
}

async function saveAll(data: Record<string, DownloadRecord>): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function ensureDownloadDir(): void {
  const dir = getDownloadDir();
  if (!dir.exists) {
    dir.create();
  }
}

/** Get current download state for a movie (verifying the file still exists). */
export async function getDownloadRecord(
  movieId: string,
): Promise<DownloadRecord | null> {
  const all = await loadAll();
  const record = all[movieId];
  if (!record) return null;
  if (record.status === "complete") {
    const file = new File(record.localPath);
    if (!file.exists) {
      delete all[movieId];
      await saveAll(all);
      return null;
    }
  }
  return record;
}

/**
 * Download a video for offline playback.
 * Calls onProgress with values 0→1 as the download progresses.
 * Returns the local file path on success.
 */
export async function downloadVideo(
  movieId: string,
  remoteUrl: string,
  onProgress: (fraction: number) => void,
): Promise<string> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(remoteUrl);
  } catch {
    throw new Error("Download source is not a valid URL.");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Download source must use HTTP or HTTPS.");
  }

  // An embed page is playable in WebView, but it is not a video file. Passing
  // it to File.downloadFileAsync saves HTML and creates a fake "complete"
  // download that can never play offline.
  if (!isDirectVideoUrl(remoteUrl)) {
    throw new Error("This server provides streaming only; no direct download file is available.");
  }

  ensureDownloadDir();
  const destFile = getLocalFile(movieId);
  const localPath = destFile.uri;

  const all = await loadAll();
  all[movieId] = {
    movieId,
    localPath,
    status: "downloading",
    progress: 0,
    sizeBytes: 0,
  };
  await saveAll(all);

  // Simulate progress while downloading (expo-file-system v19 new API has no progress callback)
  let simulatedProgress = 0;
  const progressInterval = setInterval(() => {
    simulatedProgress = Math.min(simulatedProgress + 0.04, 0.92);
    onProgress(simulatedProgress);
  }, 600);

  try {
    const destDir = getDownloadDir();
    const downloaded = await File.downloadFileAsync(remoteUrl, destDir, {
      idempotent: true,
    });

    clearInterval(progressInterval);
    onProgress(1);

    const updated = await loadAll();
    updated[movieId] = {
      ...updated[movieId],
      status: "complete",
      progress: 1,
      downloadedAt: Date.now(),
    };
    await saveAll(updated);
    return downloaded.uri;
  } catch (err) {
    clearInterval(progressInterval);
    const updated = await loadAll();
    updated[movieId] = { ...updated[movieId], status: "error" };
    await saveAll(updated);
    throw err;
  }
}

/** Return the local file URI if the movie is fully downloaded, else null. */
export async function getLocalUri(movieId: string): Promise<string | null> {
  const record = await getDownloadRecord(movieId);
  return record?.status === "complete" ? record.localPath : null;
}

/** Delete the downloaded file and remove it from the registry. */
export async function deleteDownload(movieId: string): Promise<void> {
  const all = await loadAll();
  const record = all[movieId];
  if (record) {
    try {
      const file = new File(record.localPath);
      if (file.exists) file.delete();
    } catch {}
    delete all[movieId];
    await saveAll(all);
  }
}

/** List all completed downloads. */
export async function listDownloads(): Promise<DownloadRecord[]> {
  const all = await loadAll();
  return Object.values(all).filter((r) => r.status === "complete");
}
