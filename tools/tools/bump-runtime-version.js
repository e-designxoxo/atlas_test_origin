#!/usr/bin/env node
/**
 * ATLAS deploy helper - runtime cache version bumper.
 *
 * GitHub Pages can keep old JavaScript files in browser cache. ATLAS loads the
 * ingestion runtime through script tags in app.html, so every deploy must carry
 * a fresh query-string version across all pipeline scripts.
 */

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const appPath = path.join(projectRoot, "app.html");
const version = process.env.ATLAS_VERSION || buildTimestamp();

const html = fs.readFileSync(appPath, "utf8");
const updated = html.replace(
  /(src="data\/pipeline\/[^"]+?)(?:\?v=[^"]*)?(")/g,
  `$1?v=${version}$2`
);

if (updated === html) {
  console.error("No ATLAS runtime script tags were found in app.html.");
  process.exit(1);
}

fs.writeFileSync(appPath, updated);
console.log(`ATLAS runtime cache version: ${version}`);

function buildTimestamp() {
  const now = new Date();
  const pad = value => String(value).padStart(2, "0");
  return [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    "-",
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds())
  ].join("");
}
