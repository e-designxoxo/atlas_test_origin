/**
 * ATLAS Ingestion Pipeline - Schema Registry
 *
 * Stable contract names and required fields for the deterministic pipeline.
 */

(function initAtlasSchema(root, factory) {
  const schema = factory();

  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    module.exports = schema;
  }

  root.ATLAS_Schema = schema;
  if (root.window) root.window.ATLAS_Schema = schema;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAtlasSchema() {
  "use strict";

  const VERSION = "1.0.0";

  const SCHEMA_VERSIONS = {
    extraction: "atlas.extraction.v1",
    detection: "atlas.detection.v1",
    identity: "atlas.identity.v1",
    parserOutput: "atlas.parser-output.v1",
    fiche: "atlas.fiche.v1",
    warning: "atlas.warning.v1"
  };

  const DOCUMENT_TYPES = [
    "constitution",
    "regulation",
    "directive",
    "treaty",
    "statute",
    "judgment",
    "contract",
    "unknown"
  ];

  const TYPE_LABELS = {
    constitution: "Constitution",
    regulation: "EU Regulation",
    directive: "EU Directive",
    treaty: "Treaty",
    statute: "Statute / Act",
    judgment: "Judgment / Decision",
    contract: "Contract / Agreement",
    unknown: "Legal Document"
  };

  const REQUIRED_FIELDS = {
    extraction: ["filename", "rawText", "normalizedText", "text", "extractionMethod"],
    detection: ["type", "label", "confidence", "decision", "signals"],
    identity: ["schemaVersion", "identityVersion", "canonicalId", "fingerprint", "displayTitle", "documentType", "sourceFilename"],
    parserOutput: ["documentType", "metadata", "stats"],
    fiche: ["version", "document", "summary", "provisions", "quality"]
  };

  function labelForType(type) {
    return TYPE_LABELS[type] || TYPE_LABELS.unknown;
  }

  function isKnownDocumentType(type) {
    return DOCUMENT_TYPES.includes(type);
  }

  return {
    VERSION,
    SCHEMA_VERSIONS,
    DOCUMENT_TYPES,
    TYPE_LABELS,
    REQUIRED_FIELDS,
    labelForType,
    isKnownDocumentType
  };
});
