import { initializeApp, getApps } from "firebase/app";
import { getAuth, browserLocalPersistence, browserSessionPersistence, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// ─── Firebase config — project: movie-original ────────────────────────────────
// authDomain drives which domain Google's OAuth consent screen shows under
// your app name ("to continue to <domain>") during Google Sign-In — that's
// controlled here, not by branding settings in Google Cloud Console.
//
// It defaults to the Firebase-managed host (`movie-original.firebaseapp.com`)
// because that host already serves Firebase's `/__/auth/handler` page, which
// `signInWithPopup`/`signInWithRedirect` need. Replit dev/preview domains do
// NOT serve that handler, so authDomain must stay on the Firebase default
// while developing here — do not point it at window.location.hostname or a
// Replit domain.
//
// To show your own domain instead of the firebaseapp.com one in production:
//   1. In the Firebase Console, go to Hosting → Add custom domain, and
//      connect your production domain (this deploys the `/__/auth/handler`
//      page onto YOUR domain, which is the missing piece — Google Cloud
//      Console branding alone cannot change this).
//   2. In Firebase Console → Authentication → Settings → Authorized domains,
//      add that same custom domain.
//   3. In Google Cloud Console → APIs & Services → Credentials, open the
//      "Web client (auto created by Google Service)" OAuth client and add
//      your custom domain to Authorized JavaScript origins (and Authorized
//      redirect URIs, if you use signInWithRedirect).
//   4. Once steps 1-3 are live, set EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN to your
//      custom domain in this project's production environment variables —
//      leave it unset in development so Replit preview keeps working.
const firebaseConfig = {
  // Firebase web API keys are public configuration, but must still be supplied
  // through the Expo environment so each deployment uses its own project.
  apiKey:
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY ??
    process.env.EXPO_PUBLIC_GOOGLE_API_KEY ??
    // Firebase web API keys are public configuration. Keep this fallback so
    // the app can render in Expo preview before environment setup is complete.
    "AIzaSyBLjgLERkJysAS-J1Ya4OOlX8t0u049hjs",
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "movie-original.firebaseapp.com",
  databaseURL:       "https://movie-original-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "movie-original",
  storageBucket:     "movie-original.firebasestorage.app",
  messagingSenderId: "526243776584",
  appId:             "1:526243776584:web:884fef0ce1a9238e25707d",
  measurementId:     "G-05CBC9KBWQ",
};

export const firebaseConfigReady = Boolean(firebaseConfig.apiKey);

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const firebaseAuth = getAuth(app);
export const firebaseDb = getFirestore(app);

// ─── Explicitly set localStorage persistence (avoids IndexedDB failures in
//     iframes and mobile WebViews, which is required for signInWithRedirect) ──
if (typeof window !== "undefined") {
  setPersistence(firebaseAuth, browserLocalPersistence)
    .catch(() => {
      setPersistence(firebaseAuth, browserSessionPersistence).catch(() => {});
    });
}

export default app;
