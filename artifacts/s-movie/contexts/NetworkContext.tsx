import * as Network from "expo-network";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type NetworkContextValue = {
  isOffline: boolean;
  isChecking: boolean;
  refreshNetwork: () => Promise<void>;
};

const NetworkContext = createContext<NetworkContextValue>({
  isOffline: false,
  isChecking: true,
  refreshNetwork: async () => {},
});

function stateIsOffline(state: Network.NetworkState | null): boolean {
  if (!state) return false;
  return state.isConnected === false ||
    state.isInternetReachable === false ||
    state.type === Network.NetworkStateType.NONE;
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOffline, setIsOffline] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  const refreshNetwork = useCallback(async () => {
    try {
      const state = await Network.getNetworkStateAsync();
      setIsOffline(stateIsOffline(state));
    } catch {
      // A failed probe should not hide cached content or block local playback.
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    refreshNetwork();
    const subscription = Network.addNetworkStateListener((state) => {
      setIsOffline(stateIsOffline(state));
      setIsChecking(false);
    });
    return () => subscription.remove();
  }, [refreshNetwork]);

  const value = useMemo(
    () => ({ isOffline, isChecking, refreshNetwork }),
    [isOffline, isChecking, refreshNetwork],
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetworkStatus() {
  return useContext(NetworkContext);
}