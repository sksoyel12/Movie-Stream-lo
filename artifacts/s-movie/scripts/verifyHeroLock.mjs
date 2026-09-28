import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const heroComponent = resolve(root, "components/HeroBannerCarousel.tsx");
const homeScreen = resolve(root, "app/(tabs)/index.tsx");

// These checks are intentionally local and dependency-free so they run before
// typecheck/build. Category rows remain outside the protected home-screen
// sections and can continue to evolve independently.
const EXPECTED = {
  heroComponentSha256: "dbbdabe93dc9e7d57399f7d2db329ca9ac7959b03040c7eea2f56f0397b95fa8",
  homeHeroMappingSha256: "781ae8a91df06a5c5d27d1877b7f2567a440851fba0c0a6aacc33421b262b1e5",
  homeHeroFetchSha256: "35de6fc53015ecd91ae229aabd35f5c9117c6731d26545b5e3cf4b63ecb2f784",
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

function lockedSection(source, label) {
  const startMarker = `HERO_LOCK_START: ${label}`;
  const endMarker = `HERO_LOCK_END: ${label}`;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`Hero lock markers are missing or out of order: ${label}`);
  }
  return source.slice(start, end + endMarker.length);
}

const componentSource = readRequired(heroComponent);
const homeSource = readRequired(homeScreen);
const actual = {
  heroComponentSha256: sha256(componentSource),
  homeHeroMappingSha256: sha256(lockedSection(homeSource, "home hero mapping")),
  homeHeroFetchSha256: sha256(lockedSection(homeSource, "home hero fetch")),
};

const writeBits = statSync(heroComponent).mode & 0o222;
if (writeBits !== 0) {
  throw new Error(
    "HeroBannerCarousel.tsx is writable. Keep the hero component read-only.",
  );
}

for (const [name, expected] of Object.entries(EXPECTED)) {
  if (actual[name] !== expected) {
    throw new Error(
      `Hero lock failed for ${name}. The protected hero code was changed.`,
    );
  }
}

console.log("Hero lock verified.");