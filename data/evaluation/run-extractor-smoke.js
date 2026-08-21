const fs = require("fs");
const path = require("path");
const extractor = require("../pipeline/extractor.js");
const pipeline = require("../pipeline/pipeline.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fileFromBuffer(filename, buffer, mimeType = "text/plain") {
  return {
    name: filename,
    size: buffer.byteLength,
    type: mimeType,
    async arrayBuffer() {
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
  };
}

async function testFraisseUtf16() {
  const fixture = path.join(__dirname, "fixtures/judgments/fr-fraisse-utf16.txt");
  const bytes = fs.readFileSync(fixture);
  const file = fileFromBuffer("fraisse.txt", bytes);
  const extraction = await extractor.extract(file);

  assert(extraction.encoding === "utf-16le", `Expected utf-16le, got ${extraction.encoding}.`);
  assert(!extraction.normalizedText.includes("\u0000"), "Decoded text must not contain UTF-16 null-byte artifacts.");
  assert(extraction.normalizedText.includes("Cour de Cassation, Assemblée plénière"), "Expected readable Fraisse title.");
  assert(extraction.normalizedText.includes("N° de pourvoi : 99-60.274"), "Expected readable appeal number.");
  assert(extraction.normalizedText.includes("REJETTE le pourvoi"), "Expected readable disposition.");
  assert(extraction.warnings.some(item => item.code === "TEXT_ENCODING_DETECTED"), "Expected explicit encoding warning.");

  const result = await pipeline.process(extraction, { skipExtraction: true });
  assert(result.status === "complete", `Expected complete pipeline status, got ${result.status}.`);
  assert(result.detection.type === "judgment", `Expected judgment detection, got ${result.detection.type}.`);
  assert(result.routing.parserType === "judgment", `Expected judgment route, got ${result.routing.parserType}.`);

  return {
    encoding: extraction.encoding,
    characters: extraction.normalizedText.length,
    sourceUnits: extraction.sourceUnits.length,
    detected: result.detection.type,
    confidence: result.detection.confidence,
    route: result.routing.parserType,
    provisions: result.fiche.provisions.length,
    warnings: result.warnings.map(item => item.code)
  };
}

async function testUtf8Default() {
  const bytes = Buffer.from("Cour de cassation\nDécision de test en UTF-8.", "utf8");
  const extraction = await extractor.extract(fileFromBuffer("utf8-sample.txt", bytes));

  assert(extraction.encoding === "utf-8", `Expected utf-8, got ${extraction.encoding}.`);
  assert(extraction.normalizedText.includes("Décision de test"), "UTF-8 accents must remain readable.");
  assert(!extraction.warnings.some(item => item.code === "TEXT_ENCODING_DETECTED"), "UTF-8 should not raise an encoding warning.");

  return { encoding: extraction.encoding, characters: extraction.normalizedText.length };
}

(async function main() {
  const utf8 = await testUtf8Default();
  const fraisse = await testFraisseUtf16();
  console.log(`utf8-default: encoding=${utf8.encoding}, characters=${utf8.characters}`);
  console.log(
    `fraisse-utf16: encoding=${fraisse.encoding}, characters=${fraisse.characters}, ` +
    `sourceUnits=${fraisse.sourceUnits}, detected=${fraisse.detected}, confidence=${fraisse.confidence}, ` +
    `route=${fraisse.route}, provisions=${fraisse.provisions}, warnings=${fraisse.warnings.join(",") || "none"}`
  );
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
