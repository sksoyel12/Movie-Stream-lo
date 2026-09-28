/**
 * useRequireAuth — Authentication Gate Hook
 *
 * Screens that show streaming content must call this at the top of their
 * component. If the user is not signed in, they are immediately redirected
 * to the onboarding/login screen.
 *
 * Usage:
 *   const { user, loading } = useRequireAuth();
 *   if (loading) return <LoadingView />;
 *   if (!user) return null; // redirect in progress
 *
 * The hook:
 *   1. Shows a loading state while Firebase resolves the auth state
 *      (handles the "cold start" case where currentUser is null briefly).
 *   2. Redirects unauthenticated users to /onboarding with a mode=login param.
 *   3. Stays reactive — if the user signs out mid-session, the redirect fires.
 */

import { useEffect, useState }     from "react";
import { router }                   from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseAuth }             from "@/lib/firebase";

interface AuthState {
  user:    User | null;
  loading: boolean;
}

export function useRequireAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user:    firebaseAuth.currentUser,   // may be null on cold start
    loading: firebaseAuth.currentUser === null, // skip loading if already known
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, (user) => {
      setState({ user, loading: false });

      if (!user) {
        // Push to onboarding; replace so Back button doesn't return here
        router.replace("/onboarding");
      }
    });

    return unsub;
  }, []);

  return state;
}
