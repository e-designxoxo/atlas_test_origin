const fs = require("fs");
const path = require("path");
const pipeline = require("../pipeline/pipeline.js");
const identifier = require("../pipeline/identifier.js");
const ficheGenerator = require("../pipeline/fiche-generator.js");
const cases = require("./cases.js");

function makeExtraction(filename, text) {
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

function assertCase(condition, message) {
  if (!condition) throw new Error(message);
}

async function runCase(testCase) {
  const fixturePath = path.join(__dirname, testCase.fixture);
  const text = fs.readFileSync(fixturePath, "utf8");
  const extraction = makeExtraction(testCase.filename, text);
  const result = await pipeline.process(extraction, { skipExtraction: true });
  const repeat = await pipeline.process(extraction, { skipExtraction: true });

  assertCase(result.status === "complete", `${testCase.id}: expected complete status, got ${result.status}`);
  assertCase(result.detection.type === testCase.expectedType, `${testCase.id}: expected detection ${testCase.expectedType}, got ${result.detection.type}`);
  assertCase(result.routing.parserType === testCase.expectedRoute, `${testCase.id}: expected route ${testCase.expectedRoute}, got ${result.routing.parserType}`);
  assertCase(result.detection.confidence >= testCase.minConfidence, `${testCase.id}: expected confidence >= ${testCase.minConfidence}, got ${result.detection.confidence}`);
  assertCase(result.fiche.provisions.length >= testCase.minProvisions, `${testCase.id}: expected at least ${testCase.minProvisions} provisions, got ${result.fiche.provisions.length}`);
  assertCase(result.identity && result.identity.schemaVersion === "atlas.identity.v1", `${testCase.id}: expected atlas.identity.v1 identity`);
  assertCase(result.identity.fingerprint && result.identity.fingerprint.startsWith("fp-"), `${testCase.id}: expected stable fingerprint`);
  assertCase(result.identity.canonicalId && result.identity.canonicalId.includes(result.identity.fingerprint.slice(0, 10)), `${testCase.id}: expected canonical ID to include fingerprint prefix`);
  assertCase(result.fiche.document.identity && result.fiche.document.identity.canonicalId === result.identity.canonicalId, `${testCase.id}: expected fiche to embed canonical identity`);
  for (const field of ["origin", "documentFamily", "authorityClass", "bindingCharacter"]) {
    assertCase(result.detection[field], `${testCase.id}: expected detection.${field}`);
    assertCase(result.identity.classification[field] === result.detection[field], `${testCase.id}: expected identity ${field} to preserve detection value`);
    assertCase(result.fiche.document.classification[field] === result.identity.classification[field], `${testCase.id}: expected fiche ${field} to preserve identity value`);
  }
  assertCase(repeat.identity.fingerprint === result.identity.fingerprint, `${testCase.id}: expected idempotent fingerprint`);
  assertCase(repeat.identity.canonicalId === result.identity.canonicalId, `${testCase.id}: expected idempotent canonical ID`);
  assertCase(JSON.stringify(repeat.identity.classification) === JSON.stringify(result.identity.classification), `${testCase.id}: expected idempotent classification`);

  return {
    id: testCase.id,
    status: result.status,
    detected: result.detection.type,
    confidence: result.detection.confidence,
    route: result.routing.parserType,
    canonicalId: result.identity.canonicalId,
    provisions: result.fiche.provisions.length,
    warnings: result.warnings.length
  };
}

function assertParserClassificationOverride() {
  const extraction = makeExtraction("administrative-guidance.txt", "Administrative guidance text ".repeat(20));
  const detection = {
    type: "regulation",
    confidence: 92,
    origin: "administrative",
    documentFamily: "regulatory-instrument",
    authorityClass: "primary",
    bindingCharacter: "binding",
    classificationBasis: "type-default"
  };
  const parserOutput = {
    documentType: "regulation",
    filename: extraction.filename,
    metadata: { title: "Administrative Guidance", jurisdiction: "Test jurisdiction" },
    classification: {
      authorityClass: "non-binding-institutional",
      bindingCharacter: "non-binding"
    },
    articles: [],
    references: [],
    amendments: [],
    stats: { totalElements: 0 }
  };
  const identity = identifier.buildIdentity({
    extraction,
    detection,
    routing: { parserType: "regulation" },
    parserOutput
  });
  const fiche = ficheGenerator.generate(parserOutput, { detection, identity, filename: extraction.filename });

  assertCase(identity.classification.authorityClass === "non-binding-institutional", "parser override: identity should prefer parser authority class");
  assertCase(identity.classification.bindingCharacter === "non-binding", "parser override: identity should prefer parser binding character");
  assertCase(identity.classification.origin === "administrative", "parser override: identity should preserve detection origin fallback");
  assertCase(identity.classification.basis === "parser-override", "parser override: identity should record parser override basis");
  assertCase(fiche.document.classification.bindingCharacter === "non-binding", "parser override: fiche should preserve resolved classification");
}

(async function main() {
  const rows = [];

  assertParserClassificationOverride();

  for (const testCase of cases) {
    rows.push(await runCase(testCase));
  }

  for (const row of rows) {
    console.log(`${row.id}: ${row.status}, detected=${row.detected}, confidence=${row.confidence}, route=${row.route}, provisions=${row.provisions}, warnings=${row.warnings}, id=${row.canonicalId}`);
  }
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
