import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";
import { triggerWelcomeEmail, triggerLoginNotification, isFirstTimeUser } from "@/lib/emailTriggers";

export const PROFILE_KEY = "smovie_selected_profile";
export const CUSTOM_KEY = "smovie_profile_customs";
export const AUTH_USER_KEY = "smovie_auth_user";
export const EXTRA_PROFILES_KEY = "smovie_extra_profiles";

export type Profile = {
  id: string;
  name: string;
  color: string;
  accentColor: string;
  initial: string;
  isKids: boolean;
};

export type ProfileCustom = {
  name?: string;
  color?: string;
  avatarUri?: string;
};

export const PROFILES: Profile[] = [
  {
    id: "sksoyel",
    name: "MOVIE ORIGINAL",
    color: "#E50914",
    accentColor: "#ff4d57",
    initial: "S",
    isKids: false,
  },
  {
    id: "kids",
    name: "Kids",
    color: "#0b4fd4",
    accentColor: "#4d82ff",
    initial: "K",
    isKids: true,
  },
];

type ProfileContextType = {
  profile: Profile | null;
  profileLoaded: boolean;
  selectProfile: (id: string) => Promise<void>;
  clearProfile: () => Promise<void>;
  authUserName: string | null;
  authUser: User | null;
  authLoaded: boolean;
  customs: Record<string, ProfileCustom>;
  extraProfiles: Profile[];
  addProfile: (name: string, color: string) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;
  updateProfileName: (id: string, name: string) => Promise<void>;
  updateProfileColor: (id: string, color: string) => Promise<void>;
  updateProfileAvatar: (id: string, uri: string | null) => Promise<void>;
  getDisplayName: (profileId: string) => string;
  getDisplayColor: (profileId: string) => string;
  getDisplayAvatar: (profileId: string) => string | null;
};

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  profileLoaded: false,
  selectProfile: async () => {},
  clearProfile: async () => {},
  authUserName: null,
  authUser: null,
  authLoaded: false,
  customs: {},
  extraProfiles: [],
  addProfile: async () => {},
  removeProfile: async () => {},
  updateProfileName: async () => {},
  updateProfileColor: async () => {},
  updateProfileAvatar: async () => {},
  getDisplayName: () => "MOVIE ORIGINAL",
  getDisplayColor: () => "#E50914",
  getDisplayAvatar: () => null,
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [authUserName, setAuthUserName] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [customs, setCustoms] = useState<Record<string, ProfileCustom>>({});
  const [extraProfiles, setExtraProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [saved, customsRaw, extrasRaw] = await Promise.all([
          AsyncStorage.getItem(PROFILE_KEY),
          AsyncStorage.getItem(CUSTOM_KEY),
          AsyncStorage.getItem(EXTRA_PROFILES_KEY),
        ]);

        let extras: Profile[] = [];
        if (extrasRaw) {
          try { extras = JSON.parse(extrasRaw); } catch {}
          setExtraProfiles(extras);
        }

        if (saved) {
          const found =
            PROFILES.find((p) => p.id === saved) ??
            extras.find((p) => p.id === saved);
          if (found) setProfile(found);
        }

        if (customsRaw) {
          try { setCustoms(JSON.parse(customsRaw)); } catch {}
        }
      } catch {}
      setProfileLoaded(true);
    })();
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
        try {
      setAuthUser(user);
      setAuthUserName(user?.displayName ?? user?.email ?? user?.phoneNumber ?? null);
      setAuthLoaded(true);
      if (user) {
        AsyncStorage.removeItem(AUTH_USER_KEY).catch(() => {});

        // Email triggers — all fire-and-forget, never block the auth flow.
        // Firebase sets creationTime === lastSignInTime exclusively for brand-new accounts.
        if (user.email) {
          if (isFirstTimeUser(user.metadata)) {
            // First-ever sign-in → welcome email
            triggerWelcomeEmail(user.email, user.displayName);
          } else {
            // Returning user → login notification / security alert
            triggerLoginNotification(user.email, user.displayName);
          }
        }
      } else {
        AsyncStorage.removeItem(AUTH_USER_KEY).catch(() => {});
        setAuthUserName(null);
      }
        } catch {
          setAuthUser(null);
          setAuthUserName(null);
          setAuthLoaded(true);
        }
      });
    } catch {
      // A Firebase initialization failure must not crash the root navigator.
      setAuthUser(null);
      setAuthUserName(null);
      setAuthLoaded(true);
    }
    return () => unsubscribe?.();
  }, []);

  const selectProfile = useCallback(async (id: string) => {
    const found =
      PROFILES.find((p) => p.id === id) ??
      extraProfiles.find((p) => p.id === id);
    if (!found) return;
    try { await AsyncStorage.setItem(PROFILE_KEY, id); } catch {}
    setProfile(found);
  }, [extraProfiles]);

  const clearProfile = useCallback(async () => {
    try { await AsyncStorage.removeItem(PROFILE_KEY); } catch {}
    setProfile(null);
  }, []);

  const addProfile = useCallback(async (name: string, color: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const initial = trimmed.charAt(0).toUpperCase();
    const newProfile: Profile = {
      id: `profile_${Date.now()}`,
      name: trimmed,
      color,
      accentColor: color,
      initial,
      isKids: false,
    };
    setExtraProfiles((prev) => {
      const next = [...prev, newProfile];
      AsyncStorage.setItem(EXTRA_PROFILES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const removeProfile = useCallback(async (id: string) => {
    if (PROFILES.some((p) => p.id === id)) return;
    setExtraProfiles((prev) => {
      const next = prev.filter((p) => p.id !== id);
      AsyncStorage.setItem(EXTRA_PROFILES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    setProfile((prev) => (prev?.id === id ? PROFILES[0] : prev));
    try {
      const saved = await AsyncStorage.getItem(PROFILE_KEY);
      if (saved === id) {
        await AsyncStorage.setItem(PROFILE_KEY, PROFILES[0].id);
      }
    } catch {}
  }, []);

  const updateProfileName = useCallback(async (id: string, name: string) => {
    setCustoms((prev) => {
      const next = { ...prev, [id]: { ...prev[id], name } };
      AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const updateProfileColor = useCallback(async (id: string, color: string) => {
    setCustoms((prev) => {
      const next = { ...prev, [id]: { ...prev[id], color } };
      AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const updateProfileAvatar = useCallback(async (id: string, uri: string | null) => {
    setCustoms((prev) => {
      const next = { ...prev, [id]: { ...prev[id], avatarUri: uri ?? undefined } };
      AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const getDisplayName = useCallback(
    (profileId: string): string => {
      const base =
        PROFILES.find((p) => p.id === profileId) ??
        extraProfiles.find((p) => p.id === profileId);
      if (!base) return "MOVIE ORIGINAL";
      return customs[profileId]?.name ?? base.name;
    },
    [customs, extraProfiles],
  );

  const getDisplayColor = useCallback(
    (profileId: string): string => {
      const base =
        PROFILES.find((p) => p.id === profileId) ??
        extraProfiles.find((p) => p.id === profileId);
      return customs[profileId]?.color ?? base?.color ?? "#E50914";
    },
    [customs, extraProfiles],
  );

  const getDisplayAvatar = useCallback(
    (profileId: string): string | null => {
      return customs[profileId]?.avatarUri ?? null;
    },
    [customs],
  );

  return (
    <ProfileContext.Provider
      value={{
        profile,
        profileLoaded,
        selectProfile,
        clearProfile,
        authUserName,
        authUser,
        authLoaded,
        customs,
        extraProfiles,
        addProfile,
        removeProfile,
        updateProfileName,
        updateProfileColor,
        updateProfileAvatar,
        getDisplayName,
        getDisplayColor,
        getDisplayAvatar,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export const useProfile = () => useContext(ProfileContext);
