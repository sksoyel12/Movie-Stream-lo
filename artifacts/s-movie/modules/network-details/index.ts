import { requireOptionalNativeModule } from "expo-modules-core";

export type NativeNetworkDetails = {
  connectionType: "wifi" | "cellular" | "none" | "other" | "unknown";
  generation: string | null;
  carrierName: string | null;
  countryIso: string | null;
};

type NetworkDetailsModule = {
  getNetworkDetails: () => Promise<NativeNetworkDetails>;
};

export const nativeNetworkDetails =
  requireOptionalNativeModule<NetworkDetailsModule>("NetworkDetails");
