/**
 * Pre-build script: ensures public/sw.js exists by copying from the template.
 * The actual version/timestamp injection is done by bump-sw-version.js.
 */
const fs = require("fs");
const path = require("path");

const swPath = path.join(__dirname, "..", "public", "sw.js");
const templatePath = path.join(__dirname, "..", "public", "sw.template.js");

if (!fs.existsSync(swPath) && fs.existsSync(templatePath)) {
  fs.copyFileSync(templatePath, swPath);
  console.log("[ensure-sw] copied sw.template.js -> sw.js");
}
