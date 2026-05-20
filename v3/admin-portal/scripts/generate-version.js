/**
 * Pre-build script: generates public/version.json with git info and build metadata.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function getGitInfo() {
  try {
    const hash = execSync("git rev-parse --short HEAD", { cwd: path.join(__dirname, ".."), encoding: "utf8" }).trim();
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: path.join(__dirname, ".."), encoding: "utf8" }).trim();
    const timestamp = execSync("git log -1 --format=%ct", { cwd: path.join(__dirname, ".."), encoding: "utf8" }).trim();
    return { hash, branch, commitTime: Number(timestamp) * 1000 };
  } catch {
    return { hash: "unknown", branch: "unknown", commitTime: Date.now() };
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
const git = getGitInfo();

const version = {
  app: "admin-portal",
  name: "Admin Portal",
  version: pkg.version || "0.1.0",
  commit: git.hash,
  branch: git.branch,
  builtAt: Date.now(),
  commitAt: git.commitTime,
  environment: process.env.NODE_ENV || "production",
};

fs.writeFileSync(path.join(__dirname, "..", "public", "version.json"), JSON.stringify(version, null, 2), "utf8");
console.log(`[generate-version] admin-portal ${version.version} (${version.commit})`);
