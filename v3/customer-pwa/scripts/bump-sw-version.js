/**
 * Pre-build script: injects package version + build timestamp into the service worker.
 */
const fs = require("fs");
const path = require("path");

const pkgPath = path.join(__dirname, "..", "package.json");
const swPath = path.join(__dirname, "..", "public", "sw.js");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const version = pkg.version || "0.1.0";
const timestamp = Date.now();
const cacheVersion = `v${version}.${timestamp}`;

let sw = fs.readFileSync(swPath, "utf8");

// Replace CACHE_VERSION declaration
sw = sw.replace(
  /const CACHE_VERSION = ['"].*?['"];/,
  `const CACHE_VERSION = '${cacheVersion}';`
);

// Replace header comment version
sw = sw.replace(
  /Version: .*/,
  `Version: ${version} (build ${new Date().toISOString()})`
);

fs.writeFileSync(swPath, sw, "utf8");
console.log(`[bump-sw-version] CACHE_VERSION = ${cacheVersion}`);
