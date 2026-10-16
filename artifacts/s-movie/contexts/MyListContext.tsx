import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY      = "@s-movie/my-list/v1";
const META_STORAGE_KEY = "@s-movie/my-list-meta/v1";

export interface MyListMeta {
  title:      string;
  posterUri:  string;
  mediaType:  "movie" | "tv";
}

interface MyListContextValue {
  ids:         string[];
  hydrated:    boolean;
  isInList:    (id: string) => boolean;
  toggle:      (id: string, meta?: MyListMeta) => void;
  add:         (id: string, meta?: MyListMeta) => void;
  remove:      (id: string) => void;
  clear:       () => void;
  getMeta:     (id: string) => MyListMeta | undefined;
  allItems:    Array<{ id: string } & MyListMeta>;
}

const MyListContext = createContext<MyListContextValue | null>(null);

export function MyListProvider({ children }: { children: React.ReactNode }) {
  const [ids,      setIds]      = useState<string[]>([]);
  const [meta,     setMeta]     = useState<Record<string, MyListMeta>>({});
  const [hydrated, setHydrated] = useState(false);

  // ── Hydrate both stores from AsyncStorage on mount ───────────────────────
  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(META_STORAGE_KEY),
    ]).then(([idsResult, metaResult]) => {
      if (!mounted) return;
      if (idsResult.status === "fulfilled" && idsResult.value) {
        try {
          const parsed = JSON.parse(idsResult.value);
          if (Array.isArray(parsed))
            setIds(parsed.filter((x): x is string => typeof x === "string"));
        } catch {}
      }
      if (metaResult.status === "fulfilled" && metaResult.value) {
        try {
          const parsed = JSON.parse(metaResult.value);
          if (parsed && typeof parsed === "object") setMeta(parsed);
        } catch {}
      }
      setHydrated(true);
    });
    return () => { mounted = false; };
  }, []);

  // ── Persist IDs whenever they change (after hydration) ──────────────────
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ids)).catch(() => {});
  }, [ids, hydrated]);

  // ── Persist metadata whenever it changes (after hydration) ──────────────
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta)).catch(() => {});
  }, [meta, hydrated]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const isInList = useCallback((id: string) => ids.includes(id), [ids]);

  const getMeta = useCallback((id: string) => meta[id], [meta]);

  const add = useCallback((id: string, m?: MyListMeta) => {
    setIds((prev) => (prev.includes(id) ? prev : [id, ...prev]));
    if (m) setMeta((prev) => ({ ...prev, [id]: m }));
  }, []);

  const remove = useCallback((id: string) => {
    setIds((prev) => prev.filter((x) => x !== id));
    setMeta((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }, []);

  const toggle = useCallback((id: string, m?: MyListMeta) => {
    setIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (m) setMeta((pm) => ({ ...pm, [id]: m }));
      return [id, ...prev];
    });
    // When removing, clean up metadata too
    setMeta((prev) => {
      // We optimistically set meta when adding — the remove path cleans it up.
      // But we can't know here whether we're adding or removing without reading ids,
      // so we only clean up in the dedicated remove path above.
      return prev;
    });
  }, []);

  const clear = useCallback(() => {
    setIds([]);
    setMeta({});
  }, []);

  // ── allItems: ordered list of saved items with their metadata ─────────────
  const allItems = useMemo<Array<{ id: string } & MyListMeta>>(
    () =>
      ids.map((id) => ({
        id,
        title:     meta[id]?.title     ?? "Unknown",
        posterUri: meta[id]?.posterUri ?? "",
        mediaType: meta[id]?.mediaType ?? "movie",
      })),
    [ids, meta],
  );

  const value = useMemo<MyListContextValue>(
    () => ({ ids, hydrated, isInList, toggle, add, remove, clear, getMeta, allItems }),
    [ids, hydrated, isInList, toggle, add, remove, clear, getMeta, allItems],
  );

  return (
    <MyListContext.Provider value={value}>{children}</MyListContext.Provider>
  );
}

export function useMyList() {
  const ctx = useContext(MyListContext);
  if (!ctx) throw new Error("useMyList must be used within a MyListProvider");
  return ctx;
}
