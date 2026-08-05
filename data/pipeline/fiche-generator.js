/**
 * ATLAS Ingestion Pipeline - Fiche Generator
 *
 * Turns parser output into the stable UI/product object used by the workspace.
 *
 * Legal posture:
 * - do not create unsupported legal conclusions
 * - keep every provision source-grounded
 * - expose warnings when the machine is uncertain
 * - leave explicit slots for later ML enrichment
 */

(function initAtlasFicheGenerator(root, factory) {
  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    module.exports = factory(require("./parsers/_core.js"));
    return;
  }

  root.ATLAS_FicheGenerator = factory(root.ATLAS_ParserCore || null);
})(typeof globalThis !== "undefined" ? globalThis : this, function createAtlasFicheGenerator(CORE) {
  "use strict";

  const VERSION = "1.0.0";

  const DOCUMENT_TYPE_META = {
    constitution: { label: "Constitution", color: "#7A6AAA", citationFormat: "constitution" },
    regulation: { label: "EU Regulation", color: "#636885", citationFormat: "eu-regulation" },
    directive: { label: "EU Directive", color: "#447F80", citationFormat: "eu-directive" },
    treaty: { label: "Treaty", color: "#8B6BAE", citationFormat: "treaty" },
    statute: { label: "Statute / Act", color: "#C4935A", citationFormat: "statute" },
    judgment: { label: "Judgment / Decision", color: "#C84B4B", citationFormat: "judgment" },
    contract: { label: "Contract / Agreement", color: "#4A9B6A", citationFormat: "contract" },
    unknown: { label: "Legal Document", color: "#636885", citationFormat: "generic" }
  };

  const CONCEPT_DICTIONARY = {
    en: [
      "jurisdiction", "liability", "obligation", "compliance", "enforcement",
      "penalty", "remedy", "appeal", "review", "amendment", "derogation",
      "exemption", "authorisation", "authorization", "notification",
      "registration", "transparency", "proportionality", "subsidiarity",
      "accountability", "termination", "confidentiality", "damages"
    ],
    fr: [
      "juridiction", "responsabilite", "responsabilité", "obligation",
      "conformite", "conformité", "sanction", "recours", "appel",
      "revision", "révision", "modification", "derogation", "dérogation",
      "transparence", "proportionnalite", "proportionnalité"
    ]
  };

  function generate(parserOutput, options = {}) {
    const startedAt = Date.now();
    const parsed = parserOutput || {};
    const documentType = parsed.documentType || options.documentType || "unknown";
    const typeMeta = DOCUMENT_TYPE_META[documentType] || DOCUMENT_TYPE_META.unknown;
    const identity = options.identity || null;
    const metadata = enrichMetadata(parsed.metadata || {}, parsed, typeMeta, documentType, { ...options, identity });
    const language = options.language || metadata.language || parsed.stats?.language || "en";
    const warnings = collectWarnings(parsed.warnings, options.warnings);
    const enrichedParsed = { ...parsed, metadata };

    const specialBlocks = buildSpecialBlocks(parsed, metadata, documentType);
    const elements = sourceOrderedElements(parsed);
    const provisions = buildProvisions(elements, parsed.references || [], parsed.amendments || [], metadata, documentType);
    const documentMap = buildDocumentMap(elements, specialBlocks);

    const fiche = {
      version: VERSION,
      generatedAt: new Date().toISOString(),
      document: {
        id: identity?.canonicalId || buildDocumentId(metadata, parsed.filename || options.filename),
        type: documentType,
        label: typeMeta.label,
        filename: parsed.filename || options.filename || "",
        citation: identity?.displayTitle || formatDocumentCitation(metadata, documentType),
        identity,
        metadata,
        status: determineStatus(metadata, parsed.amendments || [], documentType)
      },
      summary: generateSummary(enrichedParsed, typeMeta, provisions, warnings),
      map: documentMap,
      documentMap,
      specialBlocks,
      preamble: specialBlocks.preamble || null,
      recitals: specialBlocks.recitals || null,
      header: specialBlocks.header || null,
      provisions,
      relationships: buildRelationships(parsed, provisions),
      connections: buildConnections(parsed.references || []),
      citations: buildCitations(parsed.citations || []),
      conceptIndex: buildConceptIndex(provisions, language),
      timeline: buildTimeline(metadata, parsed.amendments || [], documentType),
      amendmentTracker: buildAmendmentTracker(parsed.amendments || [], provisions),
      typeSpecific: buildTypeSpecific(parsed),
      quality: buildQualityReport(parsed, provisions, warnings, startedAt),
      notes: {
        document: [],
        provisions: {},
        relationships: {}
      },
      actions: {
        canExport: true,
        canCite: true,
        canAnnotate: true,
        canCompare: false,
        canTranslate: false
      },
      rawParserStats: parsed.stats || {}
    };

    return fiche;
  }

  function generateFallbackFiche(text, filename, warnings = []) {
    const cleanTitle = titleFromFilename(filename || "Untitled Document");
    const content = String(text || "");

    return {
      version: VERSION,
      generatedAt: new Date().toISOString(),
      document: {
        id: slugify(cleanTitle) || "unknown-document",
        type: "unknown",
        label: DOCUMENT_TYPE_META.unknown.label,
        filename: filename || "",
        citation: cleanTitle,
        metadata: { title: cleanTitle, documentType: "unknown" },
        status: {
          status: "unprocessed",
          label: "Unprocessed",
          color: DOCUMENT_TYPE_META.unknown.color,
          description: "Document could not be fully parsed."
        }
      },
      summary: {
        short: `ATLAS could not reliably structure "${cleanTitle}".`,
        full: "The document remains readable as raw text, but legal structure and relationships were not safely inferred.",
        bulletPoints: normalizeWarnings(warnings).map(warning => warning.message)
      },
      map: [],
      documentMap: [],
      specialBlocks: {},
      preamble: null,
      recitals: null,
      header: null,
      provisions: [{
        id: "RAW-0001",
        type: "RAW",
        identifier: "1",
        heading: cleanTitle,
        content,
        citation: cleanTitle,
        source: null,
        crossReferences: [],
        notesAnchor: "notes:RAW-0001"
      }],
      relationships: [],
      connections: { internal: [], external: [], totalResolved: 0, totalUnresolved: 0, summary: "No connections detected." },
      citations: [],
      conceptIndex: {},
      timeline: [],
      amendmentTracker: { hasAmendments: false, amendments: [], summary: "No amendments detected." },
      typeSpecific: {},
      quality: {
        warnings: normalizeWarnings(warnings),
        hasWarnings: true,
        fallbackMode: true,
        generationTimeMs: 0
      },
      notes: { document: [], provisions: {}, relationships: {} },
      actions: { canExport: true, canCite: false, canAnnotate: true, canCompare: false, canTranslate: false },
      rawParserStats: { fallbackMode: true }
    };
  }

  function enrichMetadata(metadata, parsed, typeMeta, documentType, options) {
    const filename = parsed.filename || options.filename || "";
    const identity = options.identity || null;
    const identityTitle = isKnownValue(identity?.displayTitle) ? identity.displayTitle : null;
    const identityShortTitle = isKnownValue(identity?.shortTitle) ? identity.shortTitle : null;
    const identityReference = isKnownValue(identity?.reference) ? identity.reference : null;
    const identityJurisdiction = isKnownValue(identity?.jurisdiction) ? identity.jurisdiction : null;
    const identityAuthority = isKnownValue(identity?.authority) ? identity.authority : null;
    const identityDate = isKnownValue(identity?.date) ? identity.date : null;
    const title = identityTitle || metadata.title || metadata.shortTitle || titleFromFilename(filename) || "Untitled Legal Document";

    return {
      ...metadata,
      title,
      shortTitle: identityShortTitle || metadata.shortTitle,
      reference: identityReference || metadata.reference,
      jurisdiction: identityJurisdiction || metadata.jurisdiction,
      authority: identityAuthority || metadata.authority,
      adoptionDate: identityDate || metadata.adoptionDate,
      documentType,
      documentTypeLabel: typeMeta.label,
      documentTypeColor: typeMeta.color,
      sourceFilename: filename
    };
  }

  function isKnownValue(value) {
    const text = String(value || "").trim();
    return Boolean(text && !/^(unknown|null|undefined)$/i.test(text));
  }

  function sourceOrderedElements(parsed) {
    const candidateGroups = [
      parsed.articles,
      parsed.elements,
      parsed.hierarchyElements
    ].filter(Array.isArray);

    const seen = new Set();
    const elements = [];

    for (const group of candidateGroups) {
      for (const element of group) {
        if (!element || !element.canonicalId) continue;
        if (seen.has(element.canonicalId)) continue;
        seen.add(element.canonicalId);
        elements.push(element);
      }
    }

    return elements.sort((a, b) => {
      const aPos = Number.isFinite(a.position) ? a.position : Number.MAX_SAFE_INTEGER;
      const bPos = Number.isFinite(b.position) ? b.position : Number.MAX_SAFE_INTEGER;
      if (aPos !== bPos) return aPos - bPos;
      return String(a.sortKey || a.canonicalId).localeCompare(String(b.sortKey || b.canonicalId));
    });
  }

  function buildSpecialBlocks(parsed, metadata, documentType) {
    const blocks = {};
    const entries = [
      ["header", parsed.header],
      ["preamble", parsed.preamble],
      ["recitals", parsed.recitals],
      ["closing", parsed.closing],
      ["disposition", parsed.disposition]
    ];

    for (const [key, block] of entries) {
      if (!block || typeof block !== "object") continue;
      const id = block.canonicalId || key.toUpperCase();
      blocks[key] = {
        id,
        type: block.type || key.toUpperCase(),
        heading: block.heading || labelFromKey(key),
        content: block.content || block.text || "",
        citation: formatCitation({ ...block, canonicalId: id }, metadata, documentType),
        source: sourceFromElement(block)
      };
    }

    return blocks;
  }

  function buildDocumentMap(elements, specialBlocks = {}) {
    const map = [];

    for (const key of ["header", "preamble", "recitals"]) {
      const block = specialBlocks[key];
      if (!block || !block.content) continue;
      map.push({
        id: block.id,
        label: block.heading,
        level: 0,
        type: block.type,
        isEmpty: false,
        source: block.source
      });
    }

    for (const element of elements) {
      map.push({
        id: element.canonicalId,
        label: element.shortTitle || element.heading || fallbackElementLabel(element),
        level: Math.max(0, element.level || 0),
        type: element.type || "NODE",
        identifier: element.identifier || "",
        isEmpty: Boolean(element.isEmpty),
        source: sourceFromElement(element)
      });
    }

    return map;
  }

  function buildProvisions(elements, references, amendments, metadata, documentType) {
    return elements
      .filter(element => !element.isEmpty || ["PREAMBLE", "RECITALS", "HEADER"].includes(element.type))
      .map(element => {
        const outgoing = references.filter(reference => reference.sourceId === element.canonicalId);
        const amendmentInfo = amendments.find(amendment => amendment.canonicalId === element.canonicalId || amendment.sourceId === element.canonicalId) || null;

        return {
          id: element.canonicalId,
          type: element.type || "NODE",
          identifier: element.identifier || "",
          heading: element.heading || fallbackElementLabel(element),
          shortTitle: element.shortTitle || null,
          content: element.content || "",
          preview: preview(element.content || "", 240),
          charLength: element.charLength || String(element.content || "").length,
          wordCount: element.wordCount || countWords(element.content || ""),
          position: element.position,
          endPosition: element.endPosition,
          source: sourceFromElement(element),
          citation: formatCitation(element, metadata, documentType),
          crossReferences: outgoing.map(normalizeReference),
          crossReferenceCount: outgoing.length,
          unresolvedReferenceCount: outgoing.filter(reference => !reference.resolved).length,
          isAmendment: Boolean(element.isAmendment || amendmentInfo),
          amendmentInfo,
          parentId: element.parentId || element.parentSectionId || null,
          parentRole: element.parentRole || element.parentSectionRole || null,
          level: Math.max(0, element.level || 0),
          sortKey: element.sortKey || "",
          notesAnchor: `notes:${element.canonicalId}`,
          notes: []
        };
      });
  }

  function buildRelationships(parsed, provisions) {
    const provisionIds = new Set(provisions.map(provision => provision.id));
    const relationships = [];

    for (const relation of parsed.relations || parsed.relationships || []) {
      relationships.push({
        id: relation.id || `REL-${String(relationships.length + 1).padStart(4, "0")}`,
        type: relation.type || "relationship",
        sourceId: relation.sourceId || null,
        targetId: relation.targetId || null,
        sourceKnown: relation.sourceId ? provisionIds.has(relation.sourceId) : false,
        targetKnown: relation.targetId ? provisionIds.has(relation.targetId) : false,
        label: relation.label || labelFromKey(relation.type || "relationship"),
        context: relation.context || relation.description || "",
        confidence: relation.confidence || null,
        raw: relation
      });
    }

    return relationships;
  }

  function buildConnections(references) {
    const internal = [];
    const external = [];

    for (const reference of references || []) {
      const normalized = normalizeReference(reference);
      if (reference.resolved) internal.push(normalized);
      else external.push(normalized);
    }

    return {
      internal,
      external,
      totalResolved: internal.length,
      totalUnresolved: external.length,
      summary: `${internal.length} internal reference(s) resolved; ${external.length} unresolved or external reference(s).`
    };
  }

  function buildCitations(citations) {
    return (citations || []).map((citation, index) => ({
      id: citation.id || `CITE-${String(index + 1).padStart(4, "0")}`,
      type: citation.type || "citation",
      text: citation.text || citation.matchText || "",
      position: citation.position,
      sourceId: citation.sourceId || null,
      context: citation.context || ""
    }));
  }

  function buildConceptIndex(provisions, language) {
    const dictionary = CONCEPT_DICTIONARY[language] || CONCEPT_DICTIONARY.en;
    const index = {};

    for (const concept of dictionary) {
      const conceptPattern = new RegExp(`\\b${escapeRegex(concept)}\\b`, "gi");
      const matches = [];

      for (const provision of provisions) {
        const content = provision.content || "";
        const count = (content.match(conceptPattern) || []).length;
        if (count === 0) continue;
        matches.push({
          provisionId: provision.id,
          heading: provision.heading,
          citation: provision.citation,
          occurrences: count
        });
      }

      if (matches.length > 0) {
        index[concept] = {
          concept,
          totalOccurrences: matches.reduce((sum, match) => sum + match.occurrences, 0),
          provisions: matches.sort((a, b) => b.occurrences - a.occurrences)
        };
      }
    }

    return index;
  }

  function buildTimeline(metadata, amendments, documentType) {
    const events = [];
    addTimelineEvent(events, metadata.adoptionDate, "adoption", "Adopted", metadata.title);
    addTimelineEvent(events, metadata.dateForce || metadata.entryIntoForce, "entry-into-force", "Entry into force", metadata.title);
    addTimelineEvent(events, metadata.transpositionDeadline, "deadline", "Transposition deadline", metadata.title);
    addTimelineEvent(events, metadata.signatureDate, "signature", documentType === "contract" ? "Signed" : "Signature", metadata.title);

    for (const amendment of amendments || []) {
      addTimelineEvent(events, amendment.date, "amendment", amendment.heading || "Amendment", amendment.description || amendment.source || "");
    }

    return events.sort((a, b) => roughDateKey(a.date).localeCompare(roughDateKey(b.date)));
  }

  function buildAmendmentTracker(amendments, provisions) {
    const list = (amendments || []).map((amendment, index) => ({
      id: amendment.id || amendment.canonicalId || `AMEND-${String(index + 1).padStart(4, "0")}`,
      heading: amendment.heading || "Detected amendment",
      date: amendment.date || null,
      sourceId: amendment.sourceId || amendment.canonicalId || null,
      indicators: amendment.indicators || [],
      affectedProvisions: provisions
        .filter(provision => provision.isAmendment || provision.amendmentInfo?.id === amendment.id)
        .map(provision => ({ id: provision.id, heading: provision.heading, citation: provision.citation }))
    }));

    return {
      hasAmendments: list.length > 0,
      amendments: list,
      summary: list.length > 0 ? `${list.length} amendment signal(s) detected.` : "No amendments detected."
    };
  }

  function buildTypeSpecific(parsed) {
    return {
      parties: parsed.parties || null,
      boilerplateClauses: parsed.boilerplateClauses || null,
      separateOpinions: parsed.separateOpinions || null,
      disposition: parsed.disposition || null,
      transpositionArticles: parsed.transpositionArticles || null,
      closing: parsed.closing || null,
      schedules: parsed.schedules || null,
      annexes: parsed.annexes || null
    };
  }

  function buildQualityReport(parsed, provisions, warnings, startedAt) {
    const references = parsed.references || [];
    const sourceAnchored = provisions.filter(provision => provision.source && Number.isFinite(provision.source.position)).length;

    return {
      warnings,
      hasWarnings: warnings.length > 0,
      fallbackMode: Boolean(parsed.stats?.fallbackMode),
      provisionCount: provisions.length,
      referenceCount: references.length,
      resolvedReferenceCount: references.filter(reference => reference.resolved).length,
      sourceAnchoredProvisionCount: sourceAnchored,
      sourceCoverageRatio: provisions.length ? Number((sourceAnchored / provisions.length).toFixed(3)) : 0,
      parserVersion: parsed.version || null,
      generationTimeMs: Date.now() - startedAt
    };
  }

  function generateSummary(parsed, typeMeta, provisions, warnings) {
    const stats = parsed.stats || {};
    const metadata = parsed.metadata || {};
    const parts = [];

    parts.push(`${typeMeta.label} parsed into ${provisions.length} provision node(s).`);

    if (metadata.title) parts.push(`Title: ${metadata.title}.`);
    if (metadata.jurisdiction) parts.push(`Jurisdiction: ${metadata.jurisdiction}.`);
    if (stats.totalReferences > 0) parts.push(`${stats.totalReferences} cross-reference(s) detected.`);
    if (stats.citationCount > 0) parts.push(`${stats.citationCount} citation(s) detected.`);
    if (stats.relationCount > 0) parts.push(`${stats.relationCount} relationship signal(s) detected.`);
    if (stats.amendmentCount > 0) parts.push(`${stats.amendmentCount} amendment signal(s) detected.`);
    if (warnings.length > 0) parts.push(`${warnings.length} warning(s) require review.`);

    return {
      short: parts.slice(0, 2).join(" "),
      full: parts.join(" "),
      bulletPoints: parts
    };
  }

  function determineStatus(metadata, amendments, documentType) {
    if ((amendments || []).length > 0) {
      return {
        status: "amendment-signals",
        label: "Amendment Signals",
        color: "#C4935A",
        description: "ATLAS detected amendment language. Human legal review is required before relying on consolidation status."
      };
    }

    if (documentType === "contract" && metadata.signatureDate) {
      return {
        status: "signed-source",
        label: "Signed Source",
        color: "#4A9B6A",
        description: "Signature metadata was detected; contractual validity is not inferred."
      };
    }

    return {
      status: "parsed",
      label: "Parsed",
      color: DOCUMENT_TYPE_META[documentType]?.color || DOCUMENT_TYPE_META.unknown.color,
      description: "Document structure was parsed. Legal effect is not inferred by ATLAS."
    };
  }

  function formatCitation(element, metadata, documentType) {
    const title = metadata.shortTitle || metadata.title || "Untitled Document";
    const ref = metadata.regulationNumber || metadata.directiveNumber || metadata.caseNumber || metadata.actNumber || "";
    const identifier = element.identifier || "";

    if (documentType === "judgment" && element.type === "PARA") return `[${identifier}], ${ref || title}`;
    if (documentType === "statute" && element.type === "SEC") return `Section ${identifier}, ${title}`;
    if (documentType === "contract" && element.type === "CL") return `Clause ${identifier}, ${title}`;
    if (element.type === "RECITALS") return `Recitals, ${ref || title}`;
    if (element.type === "PREAMBLE" || element.type === "HEADER") return `${element.heading || element.type}, ${ref || title}`;
    if (element.type === "ART") return `Article ${identifier}, ${ref || title}`;
    if (identifier) return `${element.type || "Element"} ${identifier}, ${ref || title}`;
    return `${element.heading || element.type || "Element"}, ${ref || title}`;
  }

  function formatDocumentCitation(metadata) {
    return [
      metadata.title,
      metadata.regulationNumber,
      metadata.directiveNumber,
      metadata.caseNumber,
      metadata.actNumber,
      metadata.jurisdiction,
      metadata.adoptionDate || metadata.signatureDate
    ].filter(Boolean).join(", ") || "Untitled Document";
  }

  function normalizeReference(reference) {
    return {
      sourceId: reference.sourceId || null,
      sourceHeading: reference.sourceHeading || null,
      targetId: reference.targetCanonicalId || reference.targetId || null,
      targetHeading: reference.targetHeading || reference.targetIdentifier || null,
      targetIdentifier: reference.targetIdentifier || null,
      targetPrefix: reference.targetPrefix || null,
      referenceType: reference.referenceType || reference.type || "reference",
      resolved: Boolean(reference.resolved),
      context: reference.context || ""
    };
  }

  function collectWarnings() {
    return Array.prototype.slice.call(arguments).flat().filter(Boolean).map((warning, index) => ({
      code: warning.code || `WARNING_${index + 1}`,
      message: warning.message || String(warning),
      details: warning.details || warning.meta || null
    }));
  }

  function normalizeWarnings(warnings) {
    return collectWarnings(warnings);
  }

  function sourceFromElement(element) {
    if (!element) return null;
    if (element.source) return element.source;
    if (!Number.isFinite(element.position)) return null;

    return {
      position: element.position,
      endPosition: Number.isFinite(element.endPosition) ? element.endPosition : null,
      sourceUnitId: element.sourceUnitId || null,
      anchor: element.sourceAnchor || null
    };
  }

  function addTimelineEvent(events, date, type, label, description) {
    if (!date) return;
    events.push({ date, type, label, description: description || label });
  }

  function roughDateKey(value) {
    const text = String(value || "");
    const year = text.match(/\b(\d{4})\b/);
    return `${year ? year[1] : "9999"}-${text}`;
  }

  function buildDocumentId(metadata, filename) {
    return slugify(metadata.regulationNumber || metadata.directiveNumber || metadata.caseNumber || metadata.actNumber || metadata.title || filename || "document");
  }

  function titleFromFilename(filename) {
    if (CORE && typeof CORE.titleFromFilename === "function") return CORE.titleFromFilename(filename);
    return String(filename || "").replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  }

  function countWords(text) {
    if (CORE && typeof CORE.countWords === "function") return CORE.countWords(text);
    return String(text || "").trim().split(/\s+/).filter(Boolean).length;
  }

  function preview(text, maxLength) {
    if (CORE && typeof CORE.preview === "function") return CORE.preview(text, maxLength);
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}...` : clean;
  }

  function escapeRegex(text) {
    if (CORE && typeof CORE.escapeRegex === "function") return CORE.escapeRegex(text);
    return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 96);
  }

  function labelFromKey(key) {
    return String(key || "item").replace(/[-_]+/g, " ").replace(/\b\w/g, char => char.toUpperCase());
  }

  function fallbackElementLabel(element) {
    return [element.type || "Element", element.identifier || ""].filter(Boolean).join(" ");
  }

  return {
    VERSION,
    DOCUMENT_TYPE_META,
    generate,
    generateFallbackFiche,
    formatCitation,
    formatDocumentCitation,
    buildDocumentMap,
    buildProvisions,
    buildConnections,
    buildTimeline,
    buildAmendmentTracker,
    determineStatus,
    generateSummary
  };
});
