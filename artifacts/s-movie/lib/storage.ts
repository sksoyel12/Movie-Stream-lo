import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { listDownloads } from "./downloads";

export interface StorageInfo {
  usedBytes: number;
  freeBytes: number;
  totalBytes: number;
  usedMB: number;
  usedGB: number;
  freeMB: number;
  freeGB: number;
  usedFraction: number;
  downloadCount: number;
}

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

export async function getDeviceStorageBytes(): Promise<{
  usedBytes: number;
  freeBytes: number;
  totalBytes: number;
}> {
  if (Platform.OS === "web") {
    try {
      const storage = (globalThis as any).navigator?.storage;
      const estimate = await storage?.estimate?.();
      const totalBytes = Number(estimate?.quota) || 0;
      const usedBytes = Math.min(Number(estimate?.usage) || 0, totalBytes);
      return {
        usedBytes,
        freeBytes: Math.max(0, totalBytes - usedBytes),
        totalBytes,
      };
    } catch {
      return { usedBytes: 0, freeBytes: 0, totalBytes: 0 };
    }
  }

  try {
    const [freeBytes, totalBytes] = await Promise.all([
      FileSystem.getFreeDiskStorageAsync(),
      FileSystem.getTotalDiskCapacityAsync(),
    ]);
    return {
      usedBytes: Math.max(0, totalBytes - freeBytes),
      freeBytes,
      totalBytes,
    };
  } catch {
    return { usedBytes: 0, freeBytes: 0, totalBytes: 0 };
  }
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const downloads = await listDownloads();
  const deviceStorage = await getDeviceStorageBytes();
  const downloadCount = downloads.length;
  const { usedBytes, freeBytes, totalBytes } = deviceStorage;

  return {
    usedBytes,
    freeBytes,
    totalBytes,
    usedMB: usedBytes / MB,
    usedGB: usedBytes / GB,
    freeMB: freeBytes / MB,
    freeGB: freeBytes / GB,
    usedFraction: totalBytes > 0 ? Math.min(1, usedBytes / totalBytes) : 0,
    downloadCount,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 MB";
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < GB) return `${(bytes / MB).toFixed(0)} MB`;
  return `${(bytes / GB).toFixed(1)} GB`;
}

export function formatGB(bytes: number): string {
  return `${(bytes / GB).toFixed(1)} GB`;
}
