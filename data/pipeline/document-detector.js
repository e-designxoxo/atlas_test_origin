/**
 * ATLAS Ingestion Pipeline - Document Detector
 *
 * V1 document-type classifier for legal source text.
 *
 * The detector sits after extractor.js and before parser.js:
 *
 *   extractor.js -> document-detector.js -> parser.js
 *
 * Its job is not to parse the document. Its job is to decide which parser
 * should be used, and to explain that decision with matched signals.
 *
 * Prime directive:
 * - prefer "unknown" over a confident wrong classification.
 */

(function initAtlasDocumentDetector(root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ATLAS_DocumentDetector = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createAtlasDocumentDetector() {
  "use strict";

  const VERSION = "1.0.0";

  // Decision thresholds. These are intentionally conservative for legal work.
  const MIN_AUTO_SCORE = 42;
  const MIN_AUTO_CONFIDENCE = 62;
  const MIN_AUTO_GAP = 12;
  const SAMPLE_LIMIT = 120000;

  const FALLBACK_TYPE = {
    type: "unknown",
    label: "Unknown Document Type",
    parser: "generic-parser.js",
    color: "#636885",
    icon: "document"
  };

  /**
   * Declarative signal registry.
   *
   * Add document knowledge here, not in the scanner/scorer engine. This keeps
   * legal knowledge separate from detection mechanics.
   */
  const DOCUMENT_TYPES = [
    {
      type: "constitution",
      label: "Constitution",
      parser: "constitution-parser.js",
      color: "#7A6AAA",
      icon: "institution",
      signals: [
        signal("us_constitution_preamble", 55, {
          en: /\bWe\s+the\s+People\s+of\s+the\s+United\s+States\b/i,
          position: "early",
          description: "US Constitution preamble opening"
        }),
        signal("named_constitution_en", 48, {
          en: /\bConstitution\s+of\s+(the\s+)?[A-Z][A-Za-z .'-]{2,80}\b/i,
          position: "early",
          description: "Named constitution title"
        }),
        signal("french_constitution_exact", 55, {
          fr: /\bConstitution\s+du\s+4\s+octobre\s+1958\b/i,
          position: "early",
          description: "French Constitution exact title"
        }),
        signal("french_constitution_title", 44, {
          fr: /\bConstitution\s+(de\s+la\s+République\s+française|française)\b/i,
          position: "early",
          description: "French constitution title"
        }),
        signal("grundgesetz_exact", 52, {
          de: /\bGrundgesetz\s+(für\s+die\s+Bundesrepublik\s+Deutschland|vom\s+23\.\s+Mai\s+1949)\b/i,
          position: "early",
          description: "German Basic Law exact title"
        }),
        signal("spanish_constitution_exact", 50, {
          es: /\bConstitución\s+Española\s+(de\s+1978|del\s+27\s+de\s+diciembre)\b/i,
          position: "early",
          description: "Spanish Constitution exact title"
        }),
        signal("sovereignty_language", 22, {
          multi: [
            /\bsovereign(ty)?\s+(of\s+the\s+)?(people|nation|state)\b/i,
            /\bsouveraineté\s+(nationale|du\s+peuple)\b/i,
            /\bStaatsgewalt\s+(geht\s+)?vom\s+Volke\b/i,
            /\bsoberanía\s+(nacional|del\s+pueblo)\b/i
          ],
          position: "early",
          description: "Sovereignty declaration"
        }),
