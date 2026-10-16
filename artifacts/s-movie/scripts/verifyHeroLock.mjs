import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const heroComponent = resolve(root, "components/HeroBannerCarousel.tsx");
const homeScreen = resolve(root, "app/(tabs)/index.tsx");
const movieData = resolve(root, "data/movies.ts");
const tmdbClient = resolve(root, "lib/tmdb.ts");
const heroCache = resolve(root, "lib/homeCache.ts");
const categoryMap = resolve(root, "lib/categoryMap.ts");
const rowFetchers = resolve(root, "lib/rowFetchers.ts");
const regionHelper = resolve(root, "lib/region.ts");
const top10Component = resolve(root, "components/Top10Row.tsx");
const posterAlgorithm = resolve(root, "lib/posterAlgorithm.ts");
const accountAbout = resolve(root, "app/about.tsx");
const deviceInfo = resolve(root, "lib/deviceInfo.ts");
const apiBase = resolve(root, "lib/apiBase.ts");
const appPackage = resolve(root, "package.json");
const verificationScript = resolve(root, "scripts/verifyHeroLock.mjs");
const apiArtifact = resolve(root, "../api-server/.replit-artifact/artifact.toml");

// These checks are intentionally local and dependency-free so they run before
// typecheck/build. Category rows remain outside the protected home-screen
// sections and can continue to evolve independently.
const EXPECTED = {
  heroComponentSha256: "f1d41677405793581b89dc9d7b18567155c25b113169efb8b1de75b09db4a014",
  homeHeroMappingSha256: "0027b57dcda0e79a2d7051f1193cf5ef0ab94366430a314371cdcadca7f2c4bc",
  homeHeroFetchSha256: "7029a1760547f3ae3337bd39848d65ea926238daf49fc23b39f934f36aa4b95d",
  hero24HourRefreshBehaviorSha256: "643ffff2dc7f85603374db2df90083ccba99034333db4afd65664e9a1c33f89d",
  tmdbHeroSourceSha256: "f8858bd77fccbcc211df9e97810f1b76cef4afb8c5bb32753280aef12c91b764",
  heroMovieSourceGuardSha256: "3d5982eb55474b441173f8804a5a37b995bf5cbd0e627d8aa592c4f9463d55c3",
  tmdbHeroSourceTypeSha256: "9b5dc595727be80e16478ec2ea781305720bcca0b8c31ca0f3233690458d28c1",
  tmdbHeroCardSourceTypeSha256: "b0425567274d8c115d7b56914c837d4af00923e6eb169c15d49392fca9b4ffe4",
  heroOfflineCacheSha256: "d85d45ac699dad7717cd121913da85ecb8dacf545c4320036ba2f0a8874cad96",
  heroTrendingCategorySha256: "58e6ee784881009785b27f84438ab0bca91637caca588e83a7b0521d70d7ab39",
  trendingSourceSha256: "8c43ae4152ea0b93ceab9138ef866c70462333e51ef673a9fa6829514034e58a",
  trendingDetailFetcherSha256: "6928b330f9b8eacaff931f98b421a04327ab90db199e5c5e99725f7a1027dcdb",
  regionalCategoryLabelsSha256: "d29fb6f59786a5fccfb1380f18efef21b016ad25c5c95d976c04c59dea99fcaf",
  regionalTop10MovieRowOneSha256: "e61f770ce28eaad87ff9e643ea06379daa01fd9c73de266e916583e1d17c4f46",
  regionalTop10MovieRowTwoSha256: "c57e67ec5cd54d76980c4d483cf0c50dc29a37cb2b664ff9c609cfec5d0b672e",
  regionalTop10ShowRowSha256: "b361d2956260a2427b4803b45dd6d75ccdfdfd742980e9858bc42f93e7236948",
  regionalTop10DetailRoutesSha256: "d48618c5b3d0598b10ca95cbdb5bf9ef74db125491a22e0ecf97d29e2f23dfe6",
  legacyTop10ShowsQuerySha256: "10595f0ca16a6004f309eabee37e3eaa1dbce39efadaff134eeb6e24aa40985f",
  regionalTop10ProviderQueriesSha256: "7191ad0563d9aeda51f69459558564a62326118c4ed2a72c759fd749d3679d2b",
  netflixIndiaTop10QuerySha256: "03b37fc18dbf9782209fcc7b4316b8a4754a7740860046c690bf5c5f54a0997a",
  worldwideTop10QueriesSha256: "535652697483ab4502e1aa91e266580488defc531be5fe1c1ffde6052029620d",
  worldwideTop10DetailRouteSha256: "c0795ccc7afa7f0786557259b1392f8f4fcc9fcac1f806c68d8af68d7599d1b6",
  dynamicCategoryDetailRegistrationSha256: "5048ad9ca1ba50b44fe41b36ac79dab76b442b7691e97127da9fba3a99c32515",
  regionResolverSha256: "5a16c745eb2e663115141dd694639bc6e7a14919ce107c81fd1f1cf38af55d7b",
  top10ComponentSha256: "d67a8cb17235cc169a6f56b4b6f4bdbb5162c5a8f19bcdb30a88eeb023004749",
  posterAlgorithmSha256: "d8aee57553732f45f4da471d41ce555ada5ab7d8cff00ac09b3097f1d2136adf",
  accountIdentityNoteStyleSha256: "248063c86e8e1a06c322ddafbee807528d7ff38c8c29e5df616c63348c3559ad",
  accountIdentityNoteRenderSha256: "d47a167bb319f624e0c6b0d3cb40847b18afb61395c6e16ba5e3688ab41582f8",
  expoCpuArchitectureFieldSha256: "4cf9e5863980b097d7d5385e3abd74267baa51682c63c33155b79c159caf421b",
  apiBaseSha256: "2a53f540bbd5effdf8943c2141fcb34770de1b0bde1eed81cc9c3823f5d4da98",
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readRequired(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`Hero lock target is missing: ${path}\n${error.message}`);
  }
}

function lockedSection(source, label, markerPrefix = "HERO_LOCK") {
  const startMarker = `${markerPrefix}_START: ${label}`;
  const endMarker = `${markerPrefix}_END: ${label}`;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`Hero lock markers are missing or out of order: ${label}`);
  }
  return source.slice(start, end + endMarker.length);
}

const componentSource = readRequired(heroComponent);
const homeSource = readRequired(homeScreen);
const movieDataSource = readRequired(movieData);
const tmdbSource = readRequired(tmdbClient);
const heroCacheSource = readRequired(heroCache);
const categoryMapSource = readRequired(categoryMap);
const rowFetchersSource = readRequired(rowFetchers);
const regionSource = readRequired(regionHelper);
const top10Source = readRequired(top10Component);
const posterSource = readRequired(posterAlgorithm);
const accountAboutSource = readRequired(accountAbout);
const deviceInfoSource = readRequired(deviceInfo);
const apiBaseSource = readRequired(apiBase);
const appPackageConfig = JSON.parse(readRequired(appPackage));
const apiArtifactSource = readRequired(apiArtifact);
const appScripts = appPackageConfig.scripts ?? {};
const heroQuerySection = lockedSection(tmdbSource, "tmdb hero source query");
const heroMovieSourceGuard = lockedSection(movieDataSource, "approved hero movie source guard");
const tmdbHeroSourceType = lockedSection(tmdbSource, "TMDB hero source type");
const tmdbHeroCardSourceType = lockedSection(tmdbSource, "TMDB hero card source type");
const top10QuerySections = [
  lockedSection(tmdbSource, "legacy region top 10 shows query", "SOURCE_LOCK"),
  lockedSection(tmdbSource, "regional top 10 provider queries", "SOURCE_LOCK"),
  lockedSection(tmdbSource, "Netflix India top 10 query", "SOURCE_LOCK"),
  lockedSection(tmdbSource, "worldwide top 10 queries", "SOURCE_LOCK"),
];

if (/\/trending\//.test(heroQuerySection)) {
  throw new Error("Hero releases must not use TMDB Trending endpoints.");
}
if (/india/i.test(heroMovieSourceGuard + tmdbHeroSourceType + tmdbHeroCardSourceType)) {
  throw new Error("Hero sources are restricted to Netflix and Viki.");
}
if (top10QuerySections.some((section) => /\/trending\//.test(section))) {
  throw new Error("Top 10 queries must not use TMDB Trending endpoints.");
}
if (
  appScripts.predev !== "pnpm run verify-hero-lock" ||
  !String(appScripts.typecheck ?? "").includes("pnpm run verify-hero-lock") ||
  appScripts.prebuild !== "pnpm run verify-hero-lock"
) {
  throw new Error("Hero source verification must run before app start, typecheck, and build.");
}

const apiRouteConfigured =
  apiArtifactSource.includes("localPort = 8080") &&
  apiArtifactSource.includes('paths = ["/api"]') &&
  apiArtifactSource.includes(
    'run = "uv run --frozen --project artifacts/api-server uvicorn app.main:app --host 0.0.0.0 --port $PORT"',
  );
if (
  !String(appScripts.dev ?? "").includes(
    'EXPO_PUBLIC_API_URL="https://$REPLIT_DEV_DOMAIN"',
  ) ||
  !apiRouteConfigured
) {
  throw new Error("Movie Stream API URL and artifact routing must remain configured.");
}

const actual = {
  heroComponentSha256: sha256(componentSource),
  homeHeroMappingSha256: sha256(lockedSection(homeSource, "home hero mapping")),
  homeHeroFetchSha256: sha256(lockedSection(homeSource, "home hero fetch")),
  hero24HourRefreshBehaviorSha256: sha256(lockedSection(homeSource, "hero 24-hour refresh behavior")),
  tmdbHeroSourceSha256: sha256(heroQuerySection),
  heroMovieSourceGuardSha256: sha256(heroMovieSourceGuard),
  tmdbHeroSourceTypeSha256: sha256(tmdbHeroSourceType),
  tmdbHeroCardSourceTypeSha256: sha256(tmdbHeroCardSourceType),
  heroOfflineCacheSha256: sha256(lockedSection(heroCacheSource, "durable hero cache")),
  heroTrendingCategorySha256: sha256(lockedSection(categoryMapSource, "home trending category", "SOURCE_LOCK")),
  trendingSourceSha256: sha256(lockedSection(tmdbSource, "trending source query", "SOURCE_LOCK")),
  trendingDetailFetcherSha256: sha256(lockedSection(rowFetchersSource, "trending detail fetcher", "SOURCE_LOCK")),
  regionalCategoryLabelsSha256: sha256(lockedSection(categoryMapSource, "regional category labels", "SOURCE_LOCK")),
  regionalTop10MovieRowOneSha256: sha256(lockedSection(categoryMapSource, "regional top 10 movies row one", "SOURCE_LOCK")),
  regionalTop10MovieRowTwoSha256: sha256(lockedSection(categoryMapSource, "regional top 10 movies row two", "SOURCE_LOCK")),
  regionalTop10ShowRowSha256: sha256(lockedSection(categoryMapSource, "regional top 10 shows row", "SOURCE_LOCK")),
  regionalTop10DetailRoutesSha256: sha256(lockedSection(rowFetchersSource, "regional top 10 detail routes", "SOURCE_LOCK")),
  legacyTop10ShowsQuerySha256: sha256(top10QuerySections[0]),
  regionalTop10ProviderQueriesSha256: sha256(top10QuerySections[1]),
  netflixIndiaTop10QuerySha256: sha256(top10QuerySections[2]),
  worldwideTop10QueriesSha256: sha256(top10QuerySections[3]),
  worldwideTop10DetailRouteSha256: sha256(lockedSection(rowFetchersSource, "worldwide top 10 detail route", "SOURCE_LOCK")),
  dynamicCategoryDetailRegistrationSha256: sha256(lockedSection(rowFetchersSource, "dynamic category detail registration", "SOURCE_LOCK")),
  regionResolverSha256: sha256(regionSource),
  top10ComponentSha256: sha256(top10Source),
  posterAlgorithmSha256: sha256(posterSource),
  accountIdentityNoteStyleSha256: sha256(lockedSection(accountAboutSource, "account identity note style", "SOURCE_LOCK")),
  accountIdentityNoteRenderSha256: sha256(lockedSection(accountAboutSource, "account identity note render", "SOURCE_LOCK")),
  expoCpuArchitectureFieldSha256: sha256(lockedSection(deviceInfoSource, "Expo CPU architecture field", "SOURCE_LOCK")),
  apiBaseSha256: sha256(apiBaseSource),
};

for (const [path, label] of [
  [heroComponent, "HeroBannerCarousel.tsx"],
  [top10Component, "Top10Row.tsx"],
  [regionHelper, "region.ts"],
  [posterAlgorithm, "posterAlgorithm.ts"],
  [apiBase, "apiBase.ts"],
  [verificationScript, "verifyHeroLock.mjs"],
]) {
  if (statSync(path).mode & 0o222) {
    throw new Error(`${label} is writable. Keep protected source files read-only.`);
  }
}

for (const [name, expected] of Object.entries(EXPECTED)) {
  if (actual[name] !== expected) {
    throw new Error(
      `Hero lock failed for ${name}. The protected hero code was changed.`,
    );
  }
}

console.log("Protected hero, trending, Top 10, and daily poster source locks verified.");