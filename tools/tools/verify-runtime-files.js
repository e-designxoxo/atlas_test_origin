#!/usr/bin/env node
/**
 * ATLAS deploy helper - runtime file verifier.
 *
 * Fails fast when app.html references a local pipeline script that does not
 * exist in the deploy tree. This catches the exact class of bug that produced
 * "Missing pipeline dependency" in the browser.
 */

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const appPath = path.join(projectRoot, "app.html");
const html = fs.readFileSync(appPath, "utf8");
const scriptPaths = Array.from(html.matchAll(/src="(data\/pipeline\/[^"?]+)(?:\?[^"]*)?"/g))
  .map(match => match[1]);

const missing = scriptPaths.filter(scriptPath => !fs.existsSync(path.join(projectRoot, scriptPath)));

if (scriptPaths.length === 0) {
  console.error("No ATLAS runtime script tags were found in app.html.");
  process.exit(1);
}

if (missing.length > 0) {
  console.error("Missing ATLAS runtime files:");
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

console.log(`ATLAS runtime verifier: ${scriptPaths.length} script file(s) present.`);
