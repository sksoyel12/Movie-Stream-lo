const { withAndroidManifest, withProjectBuildGradle, withMainApplication } = require("expo/config-plugins");

module.exports = function withInstagramStoryShare(config) {
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest.queries = manifest.queries || [];
    if (!manifest.queries.some((q) => q.package?.some((p) => p.$?.["android:name"] === "com.instagram.android"))) {
      manifest.queries.push({ package: [{ $: { "android:name": "com.instagram.android" } }] });
    }
    const app = manifest.application[0];
    app.provider = app.provider || [];
    if (!app.provider.some((p) => p.$?.["android:authorities"]?.endsWith(".fileprovider"))) {
      app.provider.push({
        $: {
          "android:name": "androidx.core.content.FileProvider",
          "android:authorities": "${applicationId}.fileprovider",
          "android:exported": "false",
          "android:grantUriPermissions": "true",
        },
        "meta-data": [{
          $: {
            "android:name": "android.support.FILE_PROVIDER_PATHS",
            "android:resource": "@xml/file_paths",
          },
        }],
      });
    }
    return mod;
  });
  config = withProjectBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes("androidx.palette:palette")) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /dependencies\s*\{/,
        'dependencies {\n        implementation("androidx.palette:palette:1.0.0")',
      );
    }
    return mod;
  });
  return withMainApplication(config, (mod) => {
    if (!mod.modResults.contents.includes("InstagramStorySharePackage")) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /getPackages\(\)\s*\{([\s\S]*?)return packages;/,
        (match, body) => match.replace("return packages;", 'packages.add(new com.smovie.share.InstagramStorySharePackage());\n    return packages;'),
      );
    }
    return mod;
  });
};