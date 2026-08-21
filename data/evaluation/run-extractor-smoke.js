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

  const parsed = result.parserOutput;
  assert(parsed.metadata.court === "Cour de cassation", `Expected Cour de cassation, got ${parsed.metadata.court}.`);
  assert(parsed.metadata.formation === "Assemblée plénière", `Expected Assemblée plénière, got ${parsed.metadata.formation}.`);
  assert(parsed.metadata.caseNumber === "99-60.274", `Expected pourvoi 99-60.274, got ${parsed.metadata.caseNumber}.`);
  assert(parsed.metadata.judgmentDate === "2 juin 2000", `Expected decision date 2 juin 2000, got ${parsed.metadata.judgmentDate}.`);
  assert(parsed.metadata.publicationStatus === "Publié au bulletin", `Expected bulletin publication status, got ${parsed.metadata.publicationStatus}.`);
  assert(parsed.metadata.outcome === "Rejet", `Expected outcome Rejet, got ${parsed.metadata.outcome}.`);
  assert(parsed.metadata.lowerCourt === "Tribunal de première instance de Nouméa", `Expected lower court, got ${parsed.metadata.lowerCourt}.`);
  assert(parsed.metadata.lowerCourtDecisionDate === "03 mai 1999", `Expected lower-court date, got ${parsed.metadata.lowerCourtDecisionDate}.`);
  assert(parsed.metadata.parties.applicant === "Mlle X...", `Expected applicant Mlle X..., got ${parsed.metadata.parties.applicant}.`);
  assert(parsed.metadata.parties.respondent === "commission administrative de Nouméa", `Expected respondent commission administrative de Nouméa, got ${parsed.metadata.parties.respondent}.`);
  assert(parsed.metadata.title.includes("Cour de cassation"), "Canonical title must identify the court.");
  assert(parsed.metadata.title.includes("99-60.274"), "Canonical title must identify the appeal number.");
  assert(parsed.analysis.claims.length === 2, `Expected two distinct claims, got ${parsed.analysis.claims.length}.`);
  assert(parsed.analysis.facts?.text.includes("Mlle X..."), "Expected a source-grounded facts/case-narrative block.");
  assert(parsed.analysis.reasoning.length >= 3, `Expected at least three reasoning/holding blocks, got ${parsed.analysis.reasoning.length}.`);
  assert(parsed.analysis.issueCandidate?.status === "rule-derived-candidate", "Expected an explicitly reviewable legal-issue candidate.");
  assert(parsed.analysis.authorities.some(item => /article 77/i.test(item.citation)), "Expected Constitution article 77 authority.");
  assert(parsed.analysis.authorities.some(item => /Pacte international/i.test(item.citation)), "Expected ICCPR authority.");
  assert(parsed.disposition && /REJETTE|Par ces motifs/i.test(parsed.disposition.context), "Expected source-grounded disposition.");
  assert(parsed.elements.every(item => Number.isFinite(item.position) && Number.isFinite(item.endPosition)), "Every parsed judgment block must preserve source positions.");
  assert(parsed.elements.some(item => item.type === "ORDER" && /REJETTE/i.test(`${item.sourceMarker} ${item.content}`)), "Expected a typed operative-order block.");
  assert(!parsed.elements.find(item => item.type === "ORDER").content.includes("Bulletin 2000"), "Operative order must not absorb publisher analysis.");
  assert(result.fiche.provisions.some(item => item.type === "ORDER"), "Fiche must expose the operative order.");
  assert(result.fiche.judgmentAnalysis?.claims.length === 2, "Fiche must carry typed judgment analysis for rendering.");
  assert(result.identity.reference === "99-60.274", `Expected canonical identity reference 99-60.274, got ${result.identity.reference}.`);
  assert(result.identity.authority === "Cour de cassation", `Expected canonical identity authority, got ${result.identity.authority}.`);
  assert(result.identity.displayTitle.includes("Assemblée plénière"), "Canonical display title must preserve the judicial formation.");
  assert(result.identity.jurisdiction === "France", `Expected French jurisdiction, got ${result.identity.jurisdiction}.`);

  return {
    encoding: extraction.encoding,
    characters: extraction.normalizedText.length,
    sourceUnits: extraction.sourceUnits.length,
    detected: result.detection.type,
    confidence: result.detection.confidence,
    route: result.routing.parserType,
    provisions: result.fiche.provisions.length,
    title: parsed.metadata.title,
    claims: parsed.analysis.claims.length,
    reasoning: parsed.analysis.reasoning.length,
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
    `route=${fraisse.route}, provisions=${fraisse.provisions}, claims=${fraisse.claims}, reasoning=${fraisse.reasoning}, ` +
    `title=${fraisse.title}, warnings=${fraisse.warnings.join(",") || "none"}`
  );
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
