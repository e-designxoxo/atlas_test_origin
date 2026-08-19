/**
 * ATLAS Ingestion Pipeline - Canonical Identifier
 *
 * Builds deterministic, source-grounded identity records for imported legal
 * documents. The fiche is a view; this identity record is the legal object.
 */

(function initAtlasIdentifier(root, factory) {
  const identifier = factory(root.ATLAS_Schema || null);

  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    module.exports = factory(require("./schema.js"));
  }

  root.ATLAS_Identifier = identifier;
  if (root.window) root.window.ATLAS_Identifier = identifier;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAtlasIdentifier(SCHEMA) {
  "use strict";

  const VERSION = "1.0.0";
  const IDENTITY_VERSION = "atlas.identity.v1";

  function buildIdentity(input = {}) {
    const extraction = input.extraction || {};
    const detection = input.detection || {};
    const routing = input.routing || {};
    const parserOutput = input.parserOutput || {};
    const text = extraction.normalizedText || extraction.text || extraction.rawText || "";
    const sourceFilename = extraction.filename || parserOutput.filename || "";
    const documentType = normalizeType(parserOutput.documentType || routing.parserType || detection.type || "unknown");
    const metadata = {
      ...(parserOutput.metadata || {}),
      ...detectCanonicalIdentityMetadata(documentType, text)
    };
    const reference = firstValue(
      metadata.regulationNumber,
      metadata.directiveNumber,
      metadata.caseNumber,
      metadata.actNumber,
      metadata.treatyName,
      metadata.reference
    );
    const authority = firstValue(metadata.court, metadata.body, metadata.institution, metadata.authority);
    const jurisdiction = firstValue(metadata.jurisdiction, inferJurisdiction(metadata, text, sourceFilename));
    const date = firstValue(metadata.judgmentDate, metadata.adoptionDate, metadata.signatureDate, metadata.date);
    const fingerprint = fingerprintText(text);
    const displayTitle = buildDisplayTitle({ metadata, documentType, authority, jurisdiction, date, reference, sourceFilename });
    const shortTitle = buildShortTitle({ metadata, displayTitle, authority, date, reference, sourceFilename });
    const canonicalId = buildCanonicalId({ documentType, jurisdiction, authority, date, reference, fingerprint, displayTitle });
    const warnings = buildIdentityWarnings({ displayTitle, documentType, jurisdiction, authority, date, reference, sourceFilename, text });
    const classification = resolveClassification({ documentType, detection, parserOutput, metadata });

    return {
      schemaVersion: SCHEMA?.SCHEMA_VERSIONS?.identity || IDENTITY_VERSION,
      identityVersion: IDENTITY_VERSION,
      canonicalId,
      fingerprint,
      displayTitle,
      shortTitle,
      documentType,
      classification,
      origin: classification.origin,
      documentFamily: classification.documentFamily,
      authorityClass: classification.authorityClass,
      bindingCharacter: classification.bindingCharacter,
      jurisdiction: jurisdiction || "Unknown",
      authority: authority || "Unknown",
      date: date || "Unknown",
      reference: reference || "Unknown",
      sourceFilename,
      confidence: {
        detection: Number(detection.confidence || 0),
        identity: calculateIdentityConfidence({ jurisdiction, authority, date, reference, sourceFilename, text })
      },
      components: {
        title: firstValue(metadata.title, metadata.shortTitle),
        jurisdiction: jurisdiction || null,
        authority: authority || null,
        date: date || null,
        reference: reference || null,
        fingerprint
      },
      warnings
    };
  }

  function resolveClassification(values) {
    const defaults = SCHEMA?.dimensionDefaultsForType
      ? SCHEMA.dimensionDefaultsForType(values.documentType)
      : {};
    const parserClassification = values.parserOutput.classification || {};
    const metadata = values.metadata || {};
    const detection = values.detection || {};
    const keys = ["origin", "documentFamily", "authorityClass", "bindingCharacter"];
    const classification = {};

    for (const key of keys) {
      classification[key] = firstValue(
        parserClassification[key],
        metadata[key],
        detection[key],
        defaults[key]
      );
    }

    classification.basis = Object.keys(parserClassification).some(key => keys.includes(key))
      ? "parser-override"
      : detection.classificationBasis || "type-default";
    return classification;
  }

  function buildDisplayTitle(parts) {
    const metadataTitle = firstValue(parts.metadata.title, parts.metadata.shortTitle);
    if (parts.documentType === "judgment") {
      return [
        parts.authority,
        parts.reference && parts.reference !== parts.authority ? parts.reference : null,
        parts.date
      ].filter(isMeaningful).join(" - ") || metadataTitle || titleFromFilename(parts.sourceFilename) || "Untitled Judgment";
    }

    return metadataTitle || [
      labelForType(parts.documentType),
      parts.jurisdiction,
      parts.reference,
      parts.date
    ].filter(isMeaningful).join(" - ") || titleFromFilename(parts.sourceFilename) || "Untitled Legal Document";
  }

  function detectCanonicalIdentityMetadata(documentType, text) {
    if (documentType !== "constitution") return {};

    const sample = String(text || "").slice(0, 24000);

    if (isUsConstitutionCanonicalText(sample)) {
      return {
        title: "Constitution of the United States",
        shortTitle: "U.S. Constitution",
        jurisdiction: "United States",
        authority: "Constituent authority",
        adoptionDate: "17 September 1787",
        dateForce: "21 June 1788",
        status: "In force, as amended",
        reference: "US-CONST"
      };
    }

    if (/\bConstitution\s+du\s+4\s+octobre\s+1958\b/i.test(sample)) {
      return {
        title: "Constitution du 4 octobre 1958",
        shortTitle: "Constitution française",
        jurisdiction: "France",
        authority: "Constituent authority",
        adoptionDate: "4 octobre 1958",
        status: "In force, as amended",
        reference: "FR-CONST-1958"
      };
    }

    return {};
  }

  function isUsConstitutionCanonicalText(sample) {
    const text = String(sample || "");
    const hasFullPreamble = /\bWe\s+the\s+People\s+of\s+the\s+United\s+States\b/i.test(text);
    const hasPreambleTail = /\bsecure\s+the\s+Blessings\s+of\s+Liberty\b/i.test(text) &&
      /\bordain\s+and\s+establish\s+this\s+Constitution\s+for\s+the\s+United\b/i.test(text);
    const hasInstitutionalArticles = /\bArticle\s+I\b/i.test(text) &&
      /\bArticle\s+II\b/i.test(text) &&
      /\bArticle\s+III\b/i.test(text);
    const hasBillOfRights = /\bAmendment\s+I\b/i.test(text) &&
      /\bAmendment\s+II\b/i.test(text) &&
      /\bAmendment\s+III\b/i.test(text);

    return (hasFullPreamble || hasPreambleTail) &&
      /\bConstitution\b/i.test(text) &&
      /\bUnited\s+States(?:\s+of\s+America)?\b/i.test(text) &&
      (hasInstitutionalArticles || hasBillOfRights);
  }

  function buildShortTitle(parts) {
    if (isMeaningful(parts.metadata?.shortTitle)) return parts.metadata.shortTitle;
    if (parts.reference && parts.reference !== "Unknown") {
      return [compactAuthority(parts.authority), parts.reference, yearFromDate(parts.date)].filter(isMeaningful).join(" - ");
    }
    return preview(parts.displayTitle || titleFromFilename(parts.sourceFilename), 72);
  }

  function buildCanonicalId(parts) {
    const idCore = [
      parts.documentType,
      normalizeCode(parts.jurisdiction),
      normalizeCode(parts.authority),
      normalizeCode(parts.date),
      normalizeCode(parts.reference),
      normalizeCode(parts.displayTitle)
    ].filter(Boolean).join("-");

    return `${slugify(idCore || "document")}-${parts.fingerprint.slice(0, 10)}`;
  }

  function fingerprintText(text) {
    const normalized = normalizeFingerprintText(text);
    return `fp-${hashString(normalized)}`;
  }

  function normalizeFingerprintText(text) {
    return String(text || "")
      .normalize("NFKC")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\u00A0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function hashString(text) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;

    for (let index = 0; index < text.length; index += 1) {
      const ch = text.charCodeAt(index);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }

    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    const high = (h2 >>> 0).toString(16).padStart(8, "0");
    const low = (h1 >>> 0).toString(16).padStart(8, "0");
    return `${high}${low}`;
  }

  function buildIdentityWarnings(values) {
    const warnings = [];
    if (!isMeaningful(values.jurisdiction)) warnings.push(warning("IDENTITY_JURISDICTION_UNKNOWN", "Jurisdiction was not confidently extracted."));
    if (!isMeaningful(values.authority)) warnings.push(warning("IDENTITY_AUTHORITY_UNKNOWN", "Authority, court, or issuing body was not confidently extracted."));
    if (!isMeaningful(values.date)) warnings.push(warning("IDENTITY_DATE_UNKNOWN", "Document date was not confidently extracted."));
    if (!isMeaningful(values.reference)) warnings.push(warning("IDENTITY_REFERENCE_UNKNOWN", "Document reference or case number was not confidently extracted."));
    if (!String(values.text || "").trim()) warnings.push(warning("IDENTITY_EMPTY_TEXT", "Cannot build strong identity from empty text."));
    return warnings;
  }

  function calculateIdentityConfidence(values) {
    let score = 20;
    if (isMeaningful(values.jurisdiction)) score += 15;
    if (isMeaningful(values.authority)) score += 20;
    if (isMeaningful(values.date)) score += 15;
    if (isMeaningful(values.reference)) score += 20;
    if (isMeaningful(values.sourceFilename)) score += 5;
    if (String(values.text || "").trim().length > 200) score += 5;
    return Math.min(100, score);
  }

  function inferJurisdiction(metadata, text, filename) {
    const haystack = `${metadata.title || ""}\n${metadata.court || ""}\n${filename || ""}\n${String(text || "").slice(0, 3000)}`.toLowerCase();
    if (/\b(france|fran[cç]aise|cour d'appel|tribunal|prud'hommes|conseil d['’]etat)\b/i.test(haystack)) return "France";
    if (/\b(united states|u\.s\.|we the people)\b/i.test(haystack)) return "United States";
    if (/\b(european union|union européenne|règlement \(ue\)|regulation \(eu\)|directive \(eu\))\b/i.test(haystack)) return "European Union";
    return null;
  }

  function normalizeType(type) {
    const clean = String(type || "unknown").toLowerCase().trim();
    return SCHEMA && SCHEMA.isKnownDocumentType && SCHEMA.isKnownDocumentType(clean) ? clean : clean || "unknown";
  }

  function labelForType(type) {
    return SCHEMA && SCHEMA.labelForType ? SCHEMA.labelForType(type) : type || "Legal Document";
  }

  function firstValue() {
    return Array.prototype.slice.call(arguments).find(isMeaningful) || null;
  }

  function isMeaningful(value) {
    const text = String(value || "").trim();
    return Boolean(text && text.toLowerCase() !== "unknown" && text.toLowerCase() !== "null");
  }

  function compactAuthority(authority) {
    const text = String(authority || "").trim();
    return text
      .replace(/\bTribunal de commerce\b/i, "TC")
      .replace(/\bTribunal administratif\b/i, "TA")
      .replace(/\bCour d'appel\b/i, "CA")
      .replace(/\bConseil de prud'hommes\b/i, "CPH");
  }

  function yearFromDate(date) {
    const match = String(date || "").match(/\b(19|20)\d{2}\b/);
    return match ? match[0] : null;
  }

  function normalizeCode(value) {
    return slugify(String(value || "").slice(0, 80));
  }

  function titleFromFilename(filename) {
    return String(filename || "").replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  }

  function preview(text, maxLength) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}...` : clean;
  }

  function slugify(text) {
    return String(text || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 140);
  }

  function warning(code, message, details = null) {
    return { code, message, details };
  }

  return {
    VERSION,
    IDENTITY_VERSION,
    buildIdentity,
    fingerprintText,
    normalizeFingerprintText,
    hashString,
    slugify
  };
});
