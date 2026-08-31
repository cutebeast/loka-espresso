/**
 * Pre-build script: injects package version + build timestamp into the service worker.
 */
const fs = require("fs");
const path = require("path");

const pkgPath = path.join(__dirname, "..", "package.json");
const swPath = path.join(__dirname, "..", "public", "sw.js");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const version = pkg.version || "0.1.0";
// Stable per code change (git commit time), NOT per build — a wall-clock
// timestamp here regenerated the SW script on every rebuild and made the
// client show the "new version available" banner in a loop.
let timestamp;
try {
  const { execSync } = require("child_process");
  timestamp = Number(execSync("git log -1 --format=%ct", { cwd: path.join(__dirname, ".."), encoding: "utf8" }).trim()) * 1000;
} catch {
  timestamp = Date.now();
}
const cacheVersion = `v${version}.${timestamp}`;

let sw = fs.readFileSync(swPath, "utf8");

// Replace CACHE_VERSION declaration (let or const)
sw = sw.replace(
  /(let|const) CACHE_VERSION = ['"].*?['"];/,
  `$1 CACHE_VERSION = '${cacheVersion}';`
);

// Replace header comment version
sw = sw.replace(
  /Version: .*/,
  `Version: ${version} (commit ${timestamp})`
);

fs.writeFileSync(swPath, sw, "utf8");
console.log(`[bump-sw-version] CACHE_VERSION = ${cacheVersion}`);
