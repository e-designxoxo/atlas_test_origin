const fs = require("fs");
const path = require("path");
const pipeline = require("../pipeline/pipeline.js");

function extraction(filename, text) {
  return {
    filename,
    size: Buffer.byteLength(text, "utf8"),
    extension: "txt",
    mimeType: "text/plain",
    format: "text/plain",
    extractionMethod: "fixture",
    rawText: text,
    normalizedText: text,
    text,
    sourceUnits: [],
    warnings: []
  };
}

function readFixture(relativePath) {
  return fs.readFileSync(path.join(__dirname, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async function main() {
  const firstText = readFixture("fixtures/judgments/fr-tribunal-commerce.txt");
  const secondText = readFixture("fixtures/judgments/fr-tribunal-administratif.txt");

  const firstA = await pipeline.process(extraction("decision.txt", firstText), { skipExtraction: true });
  const firstB = await pipeline.process(extraction("renamed-decision.txt", firstText), { skipExtraction: true });
  const second = await pipeline.process(extraction("decision.txt", secondText), { skipExtraction: true });

  assert(firstA.identity.fingerprint === firstB.identity.fingerprint, "Same text must produce same fingerprint even with a different filename.");
  assert(firstA.identity.canonicalId === firstB.identity.canonicalId, "Same text must produce same canonical ID even with a different filename.");
  assert(firstA.identity.fingerprint !== second.identity.fingerprint, "Different legal texts must produce different fingerprints.");
  assert(firstA.identity.canonicalId !== second.identity.canonicalId, "Different legal texts must produce different canonical IDs.");

  const duplicate = await pipeline.process(extraction("decision-copy.txt", firstText), {
    skipExtraction: true,
    existingLibrary: [firstA.identity]
  });

  assert(duplicate.status === "duplicate-detected", `Expected duplicate-detected, got ${duplicate.status}.`);

  const partialUsConstitution = [
    "and secure the Blessings of Liberty to ourselves and our Posterity, do ordain and establish this Constitution for the United States.",
    "",
    "Article I",
    "Section 1. All legislative Powers herein granted shall be vested in a Congress of the United States.",
    "Article II",
    "Section 1. The executive Power shall be vested in a President of the United States of America.",
    "Article III",
    "Section 1. The judicial Power of the United States shall be vested in one supreme Court.",
    "Amendment I",
    "Congress shall make no law respecting an establishment of religion.",
    "Amendment II",
    "A well regulated Militia, being necessary to the security of a free State.",
    "Amendment III",
    "No Soldier shall, in time of peace be quartered in any house."
  ].join("\n");

  const usConstitution = await pipeline.process(extraction("constitution.html", partialUsConstitution), { skipExtraction: true });

  assert(usConstitution.identity.displayTitle === "Constitution of the United States", "Partial U.S. Constitution text must resolve to canonical title.");
  assert(usConstitution.identity.shortTitle === "U.S. Constitution", "Partial U.S. Constitution text must preserve canonical short title.");
  assert(usConstitution.identity.reference === "US-CONST", "Partial U.S. Constitution text must resolve to US-CONST reference.");
  assert(usConstitution.identity.jurisdiction === "United States", "Partial U.S. Constitution text must resolve to United States jurisdiction.");

  console.log(`identity-idempotence: ok, same=${firstA.identity.canonicalId}, different=${second.identity.canonicalId}`);
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
