import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

export interface RuntimeDeviceInfo {
  modelName: string | null;
  osLabel: string | null;
  osApiLevel: string | null;
  buildNumber: string | null;
  cpuArch: string | null;
  isPhysicalDevice: boolean | null;
}

interface UserAgentHighEntropy {
  model?: string;
  platformVersion?: string;
  architecture?: string;
  bitness?: string;
}

interface UserAgentDataLike {
  model?: string;
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<UserAgentHighEntropy>;
}

function clean(value: string | null | undefined): string | null {
  const result = value?.trim();
  return result ? result : null;
}

function resolveWithTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

function usableBrowserModel(value: string | null | undefined): string | null {
  const model = clean(value);
  if (!model || /^(k|wv|unknown|generic|browser|desktop|mobile|android)$/i.test(model)) {
    return null;
  }
  return model;
}

function mobilePlatformFromUserAgent(platformHint: string | null, userAgent: string): string | null {
  if (platformHint && /^(android|ios)$/i.test(platformHint)) {
    return platformHint.toLowerCase() === "android" ? "Android" : "iOS";
  }
  if (/\bAndroid\b/i.test(userAgent)) return "Android";
  if (/\b(iPhone|iPad|iPod)\b/i.test(userAgent)) return "iOS";
  return null;
}

function mobileOsVersion(platform: string, userAgent: string): string | null {
  if (platform === "Android") {
    if (/\bAndroid\s+10(?:\.0)?;\s*K(?:[;)])/i.test(userAgent)) {
      return null;
    }
    return clean(userAgent.match(/\bAndroid\s+([\d.]+)/i)?.[1]);
  }
  const version = userAgent.match(/(?:iPhone OS|CPU OS)\s+([\d_]+)/i)?.[1];
  return clean(version?.replace(/_/g, "."));
}

function androidModelFromUserAgent(userAgent: string): string | null {
  const match = userAgent.match(
    /\bAndroid\s+[\d.]+;\s*([^;)]+?)(?:\s+Build\/[^;)]+)?(?:;|\))/i,
  );
  return usableBrowserModel(match?.[1]);
}

export async function getRuntimeDeviceInfo(): Promise<RuntimeDeviceInfo> {
  if (Platform.OS === "web") {
    const nav = typeof navigator !== "undefined"
      ? navigator as Navigator & { userAgentData?: UserAgentDataLike }
      : null;
    const userAgentData = nav?.userAgentData;
    const userAgent = nav?.userAgent ?? "";
    const platform = mobilePlatformFromUserAgent(
      clean(userAgentData?.platform),
      userAgent,
    );
    if (!platform) {
      return {
        modelName: null,
        osLabel: null,
        osApiLevel: null,
        buildNumber: null,
        cpuArch: null,
        isPhysicalDevice: null,
      };
    }

    let highEntropy: UserAgentHighEntropy = {};

    try {
      if (userAgentData?.getHighEntropyValues) {
        highEntropy = await resolveWithTimeout(
          userAgentData.getHighEntropyValues([
            "model",
            "platformVersion",
            "architecture",
            "bitness",
          ]),
          800,
          {},
        );
      }
    } catch {
      // Browser privacy settings may deny high-entropy hints; omit those fields.
    }

    const version =
      clean(highEntropy.platformVersion) ?? mobileOsVersion(platform, userAgent);
    const versionMajor = version?.match(/^\d+(?:\.\d+)*/)?.[0]?.split(".")[0];
    const architecture = clean(highEntropy.architecture);
    const bitness = clean(highEntropy.bitness);

    return {
      modelName:
        usableBrowserModel(highEntropy.model) ??
        usableBrowserModel(userAgentData?.model) ??
        (platform === "Android" ? androidModelFromUserAgent(userAgent) : null),
      osLabel: versionMajor ? `${platform} ${versionMajor}` : platform,
      osApiLevel: null,
      buildNumber: null,
      cpuArch: architecture
        ? `${architecture}${bitness ? ` (${bitness}-bit)` : ""}`
        : null,
      isPhysicalDevice: null,
    };
  }

  const reportedModel = clean(Device.modelName);
  const designName = clean(Device.designName);
  const isModelCode = (value: string | null): boolean =>
    Boolean(value && /^[A-Z0-9-]+$/i.test(value));
  const modelCode = isModelCode(reportedModel)
    ? reportedModel
    : isModelCode(designName)
      ? designName
      : null;
  const marketingName = modelCode === reportedModel
    ? designName
    : reportedModel;
  const rawModel =
    marketingName && modelCode && marketingName !== modelCode
      ? `${marketingName} - ${modelCode}`
      : reportedModel ?? designName;
  const brand = clean(Device.manufacturer ?? Device.brand);
  const modelName = rawModel
    ? brand && !rawModel.toLocaleLowerCase().includes(brand.toLocaleLowerCase())
      ? `${brand} ${rawModel}`
      : rawModel
    : null;
  const osName = clean(Device.osName) ??
    (Platform.OS === "android" ? "Android" : Platform.OS === "ios" ? "iOS" : null);
  const osVersion = clean(Device.osVersion);
  const apiLevel = Platform.OS === "android" ? Device.platformApiLevel : null;
  const buildNumber = Platform.OS === "android"
    ? Constants.expoConfig?.android?.versionCode
    : Platform.OS === "ios"
    ? Constants.expoConfig?.ios?.buildNumber
    : null;
  /* SOURCE_LOCK_START: Expo CPU architecture field */
  const architectures = Device.supportedCpuArchitectures;
  /* SOURCE_LOCK_END: Expo CPU architecture field */

  return {
    modelName,
    osLabel: osName && osVersion ? `${osName} ${osVersion}` : null,
    osApiLevel: typeof apiLevel === "number" && apiLevel > 0 ? String(apiLevel) : null,
    buildNumber: buildNumber == null ? null : String(buildNumber),
    cpuArch: architectures?.find((value) => Boolean(value?.trim())) ?? null,
    isPhysicalDevice: Device.isDevice,
  };
}
