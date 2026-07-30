const fs = require("fs");
const path = require("path");
const pipeline = require("../pipeline/pipeline.js");
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

  assertCase(result.status === "complete", `${testCase.id}: expected complete status, got ${result.status}`);
  assertCase(result.detection.type === testCase.expectedType, `${testCase.id}: expected detection ${testCase.expectedType}, got ${result.detection.type}`);
  assertCase(result.routing.parserType === testCase.expectedRoute, `${testCase.id}: expected route ${testCase.expectedRoute}, got ${result.routing.parserType}`);
  assertCase(result.detection.confidence >= testCase.minConfidence, `${testCase.id}: expected confidence >= ${testCase.minConfidence}, got ${result.detection.confidence}`);
  assertCase(result.fiche.provisions.length >= testCase.minProvisions, `${testCase.id}: expected at least ${testCase.minProvisions} provisions, got ${result.fiche.provisions.length}`);

  return {
    id: testCase.id,
    status: result.status,
    detected: result.detection.type,
    confidence: result.detection.confidence,
    route: result.routing.parserType,
    provisions: result.fiche.provisions.length,
    warnings: result.warnings.length
  };
}

(async function main() {
  const rows = [];

  for (const testCase of cases) {
    rows.push(await runCase(testCase));
  }

  for (const row of rows) {
    console.log(`${row.id}: ${row.status}, detected=${row.detected}, confidence=${row.confidence}, route=${row.route}, provisions=${row.provisions}, warnings=${row.warnings}`);
  }
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
