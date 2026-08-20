/**
 * ATLAS Ingestion Pipeline - Orchestrator
 *
 * Single entry point for document ingestion:
 * extractor -> detector -> parser -> fiche generator.
 *
 * This file belongs in data/pipeline/, not data/pipeline/parsers/.
 * Parsers understand document types; the orchestrator coordinates the product
 * workflow around them.
 */



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

  /**
   * Independent classification dimensions (added 18 Aug 2026).
   *
   * `type` above answers "which parser should read this document" — a
   * mechanical/structural question. These dimensions answer a separate
   * question: "what legal function does this document perform, and what can
   * a lawyer legitimately do with it." They are independent on purpose:
   * conflating them (e.g. treating "administrative" and "primary authority"
   * as mutually exclusive) produces wrong classifications, because an agency
   * regulation is both administrative in origin AND primary in authority.
   *
   * These are DEFAULTS keyed by `type`, applied by the detector as a
   * starting point — not a final answer. A single document can depart from
   * its type's default (e.g. an administrative circular is normally
   * non-binding guidance, but an administratively-issued regulation is
   * primary and binding). Per-document overrides belong in the parser layer
   * once a specific parser has read enough of the text to know better; that
   * override path does not exist yet — see docs/07-DOCUMENT-IDENTITY.md.
   */

  const ORIGIN = {
    JUDICIAL: "judicial",
    LEGISLATIVE: "legislative",
    ADMINISTRATIVE: "administrative",
    ACADEMIC: "academic",
    PRIVATE: "private",
    INTERNATIONAL: "international"
  };

  const DOCUMENT_FAMILY = {
    JUDICIAL_DECISION: "judicial-decision",
    REGULATORY_INSTRUMENT: "regulatory-instrument",
    FOUNDATIONAL_INSTRUMENT: "foundational-instrument",
    LEGISLATIVE_ACT: "legislative-act",
    INTERNATIONAL_INSTRUMENT: "international-instrument",
    PRIVATE_INSTRUMENT: "private-instrument",
    SCHOLARSHIP: "scholarship",
    PREPARATORY_MATERIAL: "preparatory-material",
    UNCLASSIFIED: "unclassified"
  };

  // Primary / Secondary / Preparatory / Non-binding-institutional — legal
  // WEIGHT, not source. Deliberately not the same axis as origin: an
  // administrative-origin regulation is primary; administrative-origin
  // guidance on that same regulation is typically non-binding.
  const AUTHORITY_CLASS = {
    PRIMARY: "primary",
    SECONDARY: "secondary",
    PREPARATORY: "preparatory",
    NON_BINDING_INSTITUTIONAL: "non-binding-institutional",
    PRIVATE: "private",
    UNDETERMINED: "undetermined"
  };

  // Whether this document, IN THE JURISDICTION IT WAS ISSUED, binds a
  // decision-maker outright versus merely persuades one. Primary authority
  // from another jurisdiction is still primary, but typically only
  // persuasive here — see docs/07-DOCUMENT-IDENTITY.md.
  const BINDING_CHARACTER = {
    BINDING: "binding",
    PERSUASIVE: "persuasive",
    NON_BINDING: "non-binding",
    ENFORCEABLE_INTER_PARTES: "enforceable-inter-partes", // contracts: binds the parties, not third parties
    UNDETERMINED: "undetermined"
  };

  // Default dimension values per `type`. See the block comment above: these
  // are starting points a parser can override, not a settled classification.
  const TYPE_DIMENSION_DEFAULTS = {
    constitution: { origin: ORIGIN.LEGISLATIVE, documentFamily: DOCUMENT_FAMILY.FOUNDATIONAL_INSTRUMENT, authorityClass: AUTHORITY_CLASS.PRIMARY, bindingCharacter: BINDING_CHARACTER.BINDING },
    regulation: { origin: ORIGIN.ADMINISTRATIVE, documentFamily: DOCUMENT_FAMILY.REGULATORY_INSTRUMENT, authorityClass: AUTHORITY_CLASS.PRIMARY, bindingCharacter: BINDING_CHARACTER.BINDING },
    directive: { origin: ORIGIN.LEGISLATIVE, documentFamily: DOCUMENT_FAMILY.REGULATORY_INSTRUMENT, authorityClass: AUTHORITY_CLASS.PRIMARY, bindingCharacter: BINDING_CHARACTER.BINDING },
    treaty: { origin: ORIGIN.INTERNATIONAL, documentFamily: DOCUMENT_FAMILY.INTERNATIONAL_INSTRUMENT, authorityClass: AUTHORITY_CLASS.PRIMARY, bindingCharacter: BINDING_CHARACTER.BINDING },
    statute: { origin: ORIGIN.LEGISLATIVE, documentFamily: DOCUMENT_FAMILY.LEGISLATIVE_ACT, authorityClass: AUTHORITY_CLASS.PRIMARY, bindingCharacter: BINDING_CHARACTER.BINDING },
    judgment: { origin: ORIGIN.JUDICIAL, documentFamily: DOCUMENT_FAMILY.JUDICIAL_DECISION, authorityClass: AUTHORITY_CLASS.PRIMARY, bindingCharacter: BINDING_CHARACTER.UNDETERMINED }, // precedential weight depends on court + jurisdiction; not modelled yet
    contract: { origin: ORIGIN.PRIVATE, documentFamily: DOCUMENT_FAMILY.PRIVATE_INSTRUMENT, authorityClass: AUTHORITY_CLASS.PRIVATE, bindingCharacter: BINDING_CHARACTER.ENFORCEABLE_INTER_PARTES },
    unknown: { origin: null, documentFamily: DOCUMENT_FAMILY.UNCLASSIFIED, authorityClass: AUTHORITY_CLASS.UNDETERMINED, bindingCharacter: BINDING_CHARACTER.UNDETERMINED }
  };

  function dimensionDefaultsForType(type) {
    return TYPE_DIMENSION_DEFAULTS[type] || TYPE_DIMENSION_DEFAULTS.unknown;
  }

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
    ORIGIN,
    DOCUMENT_FAMILY,
    AUTHORITY_CLASS,
    BINDING_CHARACTER,
    TYPE_DIMENSION_DEFAULTS,
    dimensionDefaultsForType,
    labelForType,
    isKnownDocumentType
  };
});

