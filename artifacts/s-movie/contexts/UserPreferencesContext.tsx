/**
 * UserPreferencesContext — background AI personalization engine.
 *
 * Netflix principle: the home screen for User A must look different from User B.
 * This context loads & exposes user genre preferences computed silently from
 * watch history, clicks, and completion rates — all stored on-device.
 *
 * CRITICAL: All loads and re-computations are fire-and-forget. The home screen
 * NEVER waits for this context — it renders immediately with defaults and
 * silently upgrades once preferences are ready.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  loadPrefs,
  getTopGenres,
  getVelocityRanking,
  imageModeForGenre,
  genreLabel,
  bustPrefsCache,
  type UserPrefs,
} from "@/lib/userPreferences";

export interface UserPreferencesState {
  /** Raw preference object (null until first async load completes) */
  prefs: UserPrefs | null;
  /** User's top 3 TMDB genre IDs by weight, descending */
  topGenres: number[];
  /** Best imageMode for a personalized row derived from topGenres[0] */
  personalImageMode: "poster" | "backdrop";
  /** Content IDs sorted by velocity (most engaging in last 24 h first) */
  velocityRanking: string[];
  /** Title for the personalised row e.g. "Your Top Picks · Romance" */
  personalRowTitle: string;
  /** True once the first load from AsyncStorage has completed */
  ready: boolean;
  /**
   * Call after any tracking event so the context silently re-computes.
   * Never causes a loading state — just quietly refreshes in the background.
   */
  refresh: () => void;
}

const DEFAULT_STATE: UserPreferencesState = {
  prefs:             null,
  topGenres:         [],
  personalImageMode: "poster",
  velocityRanking:   [],
  personalRowTitle:  "Top Picks For You",
  ready:             false,
  refresh:           () => {},
};

const UserPreferencesContext = createContext<UserPreferencesState>(DEFAULT_STATE);

export function useUserPreferences(): UserPreferencesState {
  return useContext(UserPreferencesContext);
}

export function UserPreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<Omit<UserPreferencesState, "refresh">>(
    DEFAULT_STATE,
  );
  const mountedRef = useRef(true);

  const loadAndCompute = useCallback(() => {
    // Fire-and-forget: resolve next microtask so render isn't blocked
    Promise.resolve().then(async () => {
      if (!mountedRef.current) return;
      try {
        bustPrefsCache(); // ensure we read latest from AsyncStorage
        const prefs            = await loadPrefs();
        if (!mountedRef.current) return;

        const topGenres        = getTopGenres(prefs, 3);
        const velocityRanking  = getVelocityRanking(prefs);
        const personalImageMode = topGenres.length > 0
          ? imageModeForGenre(topGenres[0])
          : "poster";

        // Personalised row title: "Top Picks For You" or "Your Romance Picks"
        const personalRowTitle = topGenres.length > 0
          ? `Your ${genreLabel(topGenres[0])} Picks`
          : "Top Picks For You";

        setState({
          prefs,
          topGenres,
          velocityRanking,
          personalImageMode,
          personalRowTitle,
          ready: true,
        });
      } catch {
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, ready: true }));
        }
      }
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadAndCompute();
    return () => {
      mountedRef.current = false;
    };
  }, [loadAndCompute]);

  // refresh is debounced so rapid tracking events don't hammer storage
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(loadAndCompute, 300);
  }, [loadAndCompute]);

  return (
    <UserPreferencesContext.Provider value={{ ...state, refresh }}>
      {children}
    </UserPreferencesContext.Provider>
  );
}
