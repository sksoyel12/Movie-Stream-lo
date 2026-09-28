import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Language =
  | "en" | "hi"
  | "es" | "fr" | "de" | "it" | "pt"
  | "ru" | "ar" | "zh" | "ja" | "ko"
  | "bn" | "ta" | "te" | "mr" | "ur";

export const ALL_LANGUAGES: { code: Language; label: string; native: string; region: string }[] = [
  { code: "en", label: "English",            native: "English",    region: "Global"       },
  { code: "hi", label: "Hindi",              native: "हिंदी",       region: "South Asia"   },
  { code: "es", label: "Spanish",            native: "Español",    region: "Global"       },
  { code: "fr", label: "French",             native: "Français",   region: "Global"       },
  { code: "de", label: "German",             native: "Deutsch",    region: "Europe"       },
  { code: "it", label: "Italian",            native: "Italiano",   region: "Europe"       },
  { code: "pt", label: "Portuguese",         native: "Português",  region: "Global"       },
  { code: "ru", label: "Russian",            native: "Русский",    region: "Europe/Asia"  },
  { code: "ar", label: "Arabic",             native: "العربية",    region: "Middle East"  },
  { code: "zh", label: "Chinese (Mandarin)", native: "中文",        region: "East Asia"    },
  { code: "ja", label: "Japanese",           native: "日本語",      region: "East Asia"    },
  { code: "ko", label: "Korean",             native: "한국어",      region: "East Asia"    },
  { code: "bn", label: "Bengali",            native: "বাংলা",      region: "South Asia"   },
  { code: "ta", label: "Tamil",              native: "தமிழ்",      region: "South Asia"   },
  { code: "te", label: "Telugu",             native: "తెలుగు",     region: "South Asia"   },
  { code: "mr", label: "Marathi",            native: "मराठी",      region: "South Asia"   },
  { code: "ur", label: "Urdu",               native: "اردو",       region: "South Asia"   },
];

const VALID_CODES = new Set<string>(ALL_LANGUAGES.map((l) => l.code));

function getDeviceDefaultLanguage(): Language {
  try {
    const locale = getLocales()[0];
    const languageCode = locale?.languageCode?.toLowerCase();
    if (languageCode && VALID_CODES.has(languageCode)) {
      return languageCode as Language;
    }

    // Region is only a fallback when the device exposes no supported
    // language code (for example, a locale with no local translation yet).
    const regionDefaults: Record<string, Language> = {
      IN: "hi",
      BD: "bn",
      LK: "ta",
      NP: "hi",
      PK: "ur",
      CN: "zh",
      JP: "ja",
      KR: "ko",
      RU: "ru",
      SA: "ar",
    };
    return regionDefaults[locale?.regionCode?.toUpperCase() ?? ""] ?? "en";
  } catch {
    return "en";
  }
}

export type Translations = {
  tabHome: string;
  tabNewHot: string;
  tabSearch: string;
  tabGames: string;
  tabClips: string;
  tabProfile: string;

  profileTitle: string;
  sectionAccount: string;
  sectionApp: string;
  sectionSupport: string;

  notifications: string;
  notificationsSub: string;
  watchHistory: string;
  languageSubtitles: string;
  languageSubSub: string;

  checkUpdates: string;
  about: string;
  downloads: string;
  helpCenter: string;
  privacyTerms: string;

  continueWatching: string;
  myList: string;
  meetNextBinge: string;
  topKDramaSearches: string;
  newOnSMovie: string;
  top10India: string;
  top10Korean: string;
  blockbusterMovies: string;
  onlyOnSMovie: string;
  eastAsian: string;
  awardWinningTV: string;
  usTVShows: string;
  koreanDramas: string;
  kDramasDubbedHindi: string;

  noHistoryYet: string;
  watchHistoryTitle: string;
  clearHistory: string;
  startWatching: string;

  languageModalTitle: string;
  languageSaved: string;

  myDownloads: string;
  myDownloadsSub: string;
  downloadsModalTitle: string;
  noDownloadsYet: string;
  noDownloadsSub: string;
  deleteAll: string;
  deleteDownloadConfirm: string;
  deleteDownloadMsg: string;
  totalStorage: string;
  playNow: string;
};

const EN: Translations = {
  tabHome: "Home",
  tabNewHot: "New & Hot",
  tabSearch: "Search",
  tabGames: "Games",
  tabClips: "Clips",
  tabProfile: "My Profile",

  profileTitle: "My Profile",
  sectionAccount: "Account",
  sectionApp: "App",
  sectionSupport: "Support",

  notifications: "Notifications",
  notificationsSub: "Manage alerts & push notifications",
  watchHistory: "Watch History",
  languageSubtitles: "Language & Subtitles",
  languageSubSub: "App language & subtitle preferences",

  checkUpdates: "Check for Updates",
  about: "About",
  downloads: "Downloads",
  helpCenter: "Help Center",
  privacyTerms: "Privacy & Terms",

  continueWatching: "Continue Watching",
  myList: "My List",
  meetNextBinge: "Meet Your Next Binge",
  topKDramaSearches: "Top K-Drama Searches",
  newOnSMovie: "New on S Movie Original",
  top10India: "Top 10 Movies in India Today",
  top10Korean: "Top 10 Korean Dramas",
  blockbusterMovies: "Blockbuster Movies",
  onlyOnSMovie: "Only on S Movie Original",
  eastAsian: "East Asian Movies & TV",
  awardWinningTV: "Award-Winning TV Shows",
  usTVShows: "US TV Shows",
  koreanDramas: "Korean TV Dramas",
  kDramasDubbedHindi: "K-Dramas Dubbed in Hindi",

  noHistoryYet: "No history yet",
  watchHistoryTitle: "Watch History",
  clearHistory: "Clear All",
  startWatching: "Start watching to build your history",

  languageModalTitle: "Language & Subtitles",
  languageSaved: "Language updated!",

  myDownloads: "My Downloads",
  myDownloadsSub: "Offline saved content",
  downloadsModalTitle: "My Downloads",
  noDownloadsYet: "No downloads yet",
  noDownloadsSub: "Download movies & shows to watch offline",
  deleteAll: "Delete All",
  deleteDownloadConfirm: "Delete Download",
  deleteDownloadMsg: "Remove this download from your device?",
  totalStorage: "Total storage used",
  playNow: "Play",
};

const HI: Translations = {
  tabHome: "होम",
  tabNewHot: "नया और हॉट",
  tabSearch: "खोज",
  tabGames: "गेम्स",
  tabClips: "क्लिप्स",
  tabProfile: "मेरी प्रोफाइल",

  profileTitle: "मेरी प्रोफाइल",
  sectionAccount: "खाता",
  sectionApp: "ऐप",
  sectionSupport: "सहायता",

  notifications: "सूचनाएं",
  notificationsSub: "अलर्ट और पुश सूचनाएं प्रबंधित करें",
  watchHistory: "देखने का इतिहास",
  languageSubtitles: "भाषा और उपशीर्षक",
  languageSubSub: "ऐप की भाषा और उपशीर्षक प्राथमिकताएं",

  checkUpdates: "अपडेट जांचें",
  about: "जानकारी",
  downloads: "डाउनलोड",
  helpCenter: "सहायता केंद्र",
  privacyTerms: "गोपनीयता और शर्तें",

  continueWatching: "देखना जारी रखें",
  myList: "मेरी सूची",
  meetNextBinge: "अपना अगला शो खोजें",
  topKDramaSearches: "टॉप के-ड्रामा",
  newOnSMovie: "S Movie Original ओरिजिनल पर नया",
  top10India: "भारत में आज के टॉप 10 मूवीज़",
  top10Korean: "टॉप 10 कोरियन ड्रामा",
  blockbusterMovies: "ब्लॉकबस्टर मूवीज़",
  onlyOnSMovie: "केवल S Movie Original पर",
  eastAsian: "पूर्वी एशियाई फिल्में और TV",
  awardWinningTV: "पुरस्कार विजेता TV शो",
  usTVShows: "US TV शो",
  koreanDramas: "कोरियन TV ड्रामा",
  kDramasDubbedHindi: "हिंदी में डब के-ड्रामा",

  noHistoryYet: "अभी तक कोई इतिहास नहीं",
  watchHistoryTitle: "देखने का इतिहास",
  clearHistory: "सब हटाएं",
  startWatching: "इतिहास बनाने के लिए कुछ देखें",

  languageModalTitle: "भाषा और उपशीर्षक",
  languageSaved: "भाषा अपडेट हो गई!",

  myDownloads: "मेरे डाउनलोड",
  myDownloadsSub: "ऑफलाइन सहेजी गई सामग्री",
  downloadsModalTitle: "मेरे डाउनलोड",
  noDownloadsYet: "अभी तक कोई डाउनलोड नहीं",
  noDownloadsSub: "ऑफलाइन देखने के लिए मूवी और शो डाउनलोड करें",
  deleteAll: "सब हटाएं",
  deleteDownloadConfirm: "डाउनलोड हटाएं",
  deleteDownloadMsg: "इस डाउनलोड को डिवाइस से हटाएं?",
  totalStorage: "कुल संग्रहण उपयोग",
  playNow: "चलाएं",
};

// All non-EN/HI languages safely fall back to English translations.
// The user's selection is persisted so future full translations can be added incrementally.
const TRANSLATIONS: Record<Language, Translations> = {
  en: EN,
  hi: HI,
  es: EN,
  fr: EN,
  de: EN,
  it: EN,
  pt: EN,
  ru: EN,
  ar: EN,
  zh: EN,
  ja: EN,
  ko: EN,
  bn: EN,
  ta: EN,
  te: EN,
  mr: EN,
  ur: EN,
};

const LANG_KEY = "smovie_language";

type LanguageContextType = {
  language: Language;
  t: Translations;
  setLanguage: (lang: Language) => Promise<void>;
};

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  t: EN,
  setLanguage: async () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLang] = useState<Language>(() => getDeviceDefaultLanguage());

  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY)
      .then((stored) => {
        if (stored && VALID_CODES.has(stored)) setLang(stored as Language);
      })
      .catch(() => {});
  }, []);

  const setLanguage = useCallback(async (lang: Language) => {
    setLang(lang);
    try {
      await AsyncStorage.setItem(LANG_KEY, lang);
    } catch {}
  }, []);

  return (
    <LanguageContext.Provider value={{ language, t: TRANSLATIONS[language], setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
