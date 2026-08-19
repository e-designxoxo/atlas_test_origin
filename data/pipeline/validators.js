/**
 * ATLAS Ingestion Pipeline - Validators
 *
 * Fail-safe checks for pipeline records. Validators return warnings instead of
 * throwing by default so the UI can surface uncertainty professionally.
 */

(function initAtlasValidators(root, factory) {
  const validators = factory(root.ATLAS_Schema || null);

  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    module.exports = factory(require("./schema.js"));
  }

  root.ATLAS_Validators = validators;
  if (root.window) root.window.ATLAS_Validators = validators;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAtlasValidators(SCHEMA) {
  "use strict";

  const VERSION = "1.0.0";

  function validateRecord(record, contractName) {
    const required = SCHEMA?.REQUIRED_FIELDS?.[contractName] || [];
    const warnings = [];

    if (!record || typeof record !== "object") {
      return [warning("VALIDATION_RECORD_MISSING", `${contractName} record is missing.`)];
    }

    for (const field of required) {
      if (record[field] === undefined || record[field] === null || record[field] === "") {
        warnings.push(warning("VALIDATION_REQUIRED_FIELD", `${contractName}.${field} is required.`, { contractName, field }));
      }
    }

    return warnings;
  }

  function validateExtraction(extraction) {
    const warnings = validateRecord(extraction, "extraction");
    const text = extraction?.normalizedText || extraction?.text || "";
    if (String(text).trim().length < 50) {
      warnings.push(warning("VALIDATION_EXTRACTION_TOO_SHORT", "Extraction text is too short for reliable legal parsing."));
    }
    if (!extraction?.rawText) {
      warnings.push(warning("VALIDATION_RAW_TEXT_MISSING", "Raw source text is missing; lossless contract is weakened."));
    }
    return warnings;
  }

  function validateDetection(detection) {
    const warnings = validateRecord(detection, "detection");
    if (detection && SCHEMA?.isKnownDocumentType && !SCHEMA.isKnownDocumentType(detection.type)) {
      warnings.push(warning("VALIDATION_UNKNOWN_DOCUMENT_TYPE", `Detector returned unregistered document type "${detection.type}".`));
    }
    if (detection && detection.decision === "auto" && Number(detection.confidence || 0) < 70) {
      warnings.push(warning("VALIDATION_LOW_AUTO_CONFIDENCE", "Detector auto-routed below recommended confidence."));
    }
    warnings.push(...validateClassification(detection, "detection"));
    return warnings;
  }

  function validateIdentity(identity) {
    const warnings = validateRecord(identity, "identity");
    if (identity?.warnings) warnings.push(...normalizeWarnings(identity.warnings));
    if (identity?.canonicalId && !identity.canonicalId.includes(String(identity.fingerprint || "").slice(0, 10))) {
      warnings.push(warning("VALIDATION_IDENTITY_NOT_FINGERPRINTED", "Canonical ID does not include the text fingerprint prefix."));
    }
    warnings.push(...validateClassification(identity?.classification || identity, "identity.classification"));
    return dedupeWarnings(warnings);
  }

  function validateParserOutput(parserOutput) {
    const warnings = validateRecord(parserOutput, "parserOutput");
    const totalElements = parserOutput?.stats?.totalElements || parserOutput?.elements?.length || parserOutput?.articles?.length || 0;
    if (totalElements === 0) warnings.push(warning("VALIDATION_NO_PARSED_ELEMENTS", "Parser produced no structural elements."));
    return warnings;
  }

  function validateFiche(fiche) {
    const warnings = validateRecord(fiche, "fiche");
    if (!Array.isArray(fiche?.provisions)) warnings.push(warning("VALIDATION_PROVISIONS_NOT_ARRAY", "Fiche provisions must be an array."));
    if (!fiche?.document?.identity) warnings.push(warning("VALIDATION_FICHE_IDENTITY_MISSING", "Fiche is missing canonical document identity."));
    warnings.push(...validateClassification(fiche?.document?.classification, "fiche.document.classification"));
    return warnings;
  }

  function validateClassification(classification, contractName) {
    const warnings = [];
    const values = classification || {};
    const allowed = {
      origin: Object.values(SCHEMA?.ORIGIN || {}),
      documentFamily: Object.values(SCHEMA?.DOCUMENT_FAMILY || {}),
      authorityClass: Object.values(SCHEMA?.AUTHORITY_CLASS || {}),
      bindingCharacter: Object.values(SCHEMA?.BINDING_CHARACTER || {})
    };

    for (const [field, accepted] of Object.entries(allowed)) {
      if (!values[field]) {
        warnings.push(warning("VALIDATION_CLASSIFICATION_MISSING", `${contractName}.${field} is missing.`, { contractName, field }));
      } else if (accepted.length && !accepted.includes(values[field])) {
        warnings.push(warning("VALIDATION_CLASSIFICATION_VALUE", `${contractName}.${field} has unregistered value "${values[field]}".`, { contractName, field, value: values[field] }));
      }
    }
    return warnings;
  }

  function normalizeWarnings(warnings) {
    return (Array.isArray(warnings) ? warnings : warnings ? [warnings] : []).map(item => {
      if (typeof item === "string") return warning("WARNING", item);
      return warning(item.code || "WARNING", item.message || String(item), item.details || null);
    });
  }

  function dedupeWarnings(warnings) {
    const seen = new Set();
    const unique = [];
    for (const item of normalizeWarnings(warnings)) {
      const key = `${item.code}|${item.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    return unique;
  }

  function warning(code, message, details = null) {
    return {
      schemaVersion: SCHEMA?.SCHEMA_VERSIONS?.warning || "atlas.warning.v1",
      code,
      message,
      details
    };
  }

  return {
    VERSION,
    validateRecord,
    validateExtraction,
    validateDetection,
    validateIdentity,
    validateParserOutput,
    validateFiche,
    normalizeWarnings,
    dedupeWarnings,
    warning
  };
});
  }

  function validateExtraction(extraction) {
    const warnings = validateRecord(extraction, "extraction");
    const text = extraction?.normalizedText || extraction?.text || "";
    if (String(text).trim().length < 50) {
      warnings.push(warning("VALIDATION_EXTRACTION_TOO_SHORT", "Extraction text is too short for reliable legal parsing."));
    }
    if (!extraction?.rawText) {
      warnings.push(warning("VALIDATION_RAW_TEXT_MISSING", "Raw source text is missing; lossless contract is weakened."));
    }
    return warnings;
  }

  function validateDetection(detection) {
    const warnings = validateRecord(detection, "detection");
    if (detection && SCHEMA?.isKnownDocumentType && !SCHEMA.isKnownDocumentType(detection.type)) {
      warnings.push(warning("VALIDATION_UNKNOWN_DOCUMENT_TYPE", `Detector returned unregistered document type "${detection.type}".`));
    }
    if (detection && detection.decision === "auto" && Number(detection.confidence || 0) < 70) {
      warnings.push(warning("VALIDATION_LOW_AUTO_CONFIDENCE", "Detector auto-routed below recommended confidence."));
    }
    return warnings;
  }

  function validateIdentity(identity) {
    const warnings = validateRecord(identity, "identity");
    if (identity?.warnings) warnings.push(...normalizeWarnings(identity.warnings));
    if (identity?.canonicalId && !identity.canonicalId.includes(String(identity.fingerprint || "").slice(0, 10))) {
      warnings.push(warning("VALIDATION_IDENTITY_NOT_FINGERPRINTED", "Canonical ID does not include the text fingerprint prefix."));
    }
    return dedupeWarnings(warnings);
  }

  function validateParserOutput(parserOutput) {
    const warnings = validateRecord(parserOutput, "parserOutput");
    const totalElements = parserOutput?.stats?.totalElements || parserOutput?.elements?.length || parserOutput?.articles?.length || 0;
    if (totalElements === 0) warnings.push(warning("VALIDATION_NO_PARSED_ELEMENTS", "Parser produced no structural elements."));
    return warnings;
  }

  function validateFiche(fiche) {
    const warnings = validateRecord(fiche, "fiche");
    if (!Array.isArray(fiche?.provisions)) warnings.push(warning("VALIDATION_PROVISIONS_NOT_ARRAY", "Fiche provisions must be an array."));
    if (!fiche?.document?.identity) warnings.push(warning("VALIDATION_FICHE_IDENTITY_MISSING", "Fiche is missing canonical document identity."));
    return warnings;
  }

  function normalizeWarnings(warnings) {
    return (Array.isArray(warnings) ? warnings : warnings ? [warnings] : []).map(item => {
      if (typeof item === "string") return warning("WARNING", item);
      return warning(item.code || "WARNING", item.message || String(item), item.details || null);
    });
  }

  function dedupeWarnings(warnings) {
    const seen = new Set();
    const unique = [];
    for (const item of normalizeWarnings(warnings)) {
      const key = `${item.code}|${item.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    return unique;
  }

  function warning(code, message, details = null) {
    return {
      schemaVersion: SCHEMA?.SCHEMA_VERSIONS?.warning || "atlas.warning.v1",
      code,
      message,
      details
    };
  }

  return {
    VERSION,
    validateRecord,
    validateExtraction,
    validateDetection,
    validateIdentity,
    validateParserOutput,
    validateFiche,
    normalizeWarnings,
    dedupeWarnings,
    warning
  };
});
