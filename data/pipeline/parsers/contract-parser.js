/**
 * ATLAS Ingestion Pipeline - Contract Parser
 *
 * Parses contracts and private-law agreements into structured, source-grounded
 * legal data.
 *
 * Contract-specific priorities:
 * - detect parties, recitals, operative clauses, schedules, and signatures
 * - tag common boilerplate clauses without performing legal judgment
 * - preserve clause-level source positions for later review and annotation
 */

(function initAtlasContractParser(root, factory) {
  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    module.exports = factory(require("./_core.js"));
    return;
  }

  if (!root.ATLAS_ParserCore) {
    throw new Error("[contract-parser] ATLAS_ParserCore must be loaded before this module.");
  }

  root.ATLAS_ContractParser = factory(root.ATLAS_ParserCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function createAtlasContractParser(CORE) {
  "use strict";

  const VERSION = "1.0.0";
  const DOCUMENT_TYPE = "contract";
  const MIN_CLAUSE_COUNT_WARNING = 2;

  const STRUCTURAL_PATTERNS = {
    en: [
      CORE.pattern("schedule-en", /\b(?:Schedule|SCHEDULE|Exhibit|EXHIBIT|Appendix|APPENDIX)\s+([IVXLCDM]+|\d+|[A-Z])\b[\s.\-—:]*([^]*)?$/i, 0, "SCHEDULE", match => match[1], { isAnnex: true }),
      CORE.pattern("part-en", /\b(?:Part|PART)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 1, "PART", match => match[1]),
      CORE.pattern("clause-en", /\b(?:Clause|CLAUSE|Cl\.?)\s+(\d{1,4}[A-Za-z]?(?:\.\d+)?)\b[\s.\-—:]*([^]*)?$/i, 2, "CL", match => match[1]),
      CORE.pattern("section-en", /\b(?:Section|SECTION)\s+(\d+[A-Za-z]?(?:\.\d+)?)\b[\s.\-—:]*([^]*)?$/i, 2, "SEC", match => match[1]),
      CORE.pattern("article-en", /\b(?:Article|ARTICLE)\s+(\d{1,4}[A-Za-z]?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?)\b[\s.\-—:]*([^]*)?$/i, 2, "ART", match => match[1]),
      CORE.pattern("subclause-en", /^\s*\(([a-z]|\d{1,3}[a-z]?|[ivxlcdm]+)\)\s+(.+)$/i, 3, "SUBCL", match => match[1])
    ],
    fr: [
      CORE.pattern("annex-fr", /\b(?:Annexe|ANNEXE|Pièce|PIÈCE)\s+([IVXLCDM]+|\d+|[A-Z])\b[\s.\-—:]*([^]*)?$/i, 0, "SCHEDULE", match => match[1], { isAnnex: true }),
      CORE.pattern("part-fr", /\b(?:Partie|PARTIE)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 1, "PART", match => match[1]),
      CORE.pattern("article-fr", /\b(?:Article|ARTICLE|Art\.?)\s+(\d{1,4}(?:er|ère|eme|ème)?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?)\b[\s.\-—:]*([^]*)?$/i, 2, "ART", match => match[1]),
      CORE.pattern("clause-fr", /\b(?:Clause|CLAUSE)\s+(\d{1,4}[A-Za-z]?(?:\.\d+)?)\b[\s.\-—:]*([^]*)?$/i, 2, "CL", match => match[1])
    ],
    de: [
      CORE.pattern("schedule-de", /\b(?:Anlage|ANLAGE|Anhang|ANHANG)\s+([IVXLCDM]+|\d+|[A-Z])\b[\s.\-—:]*([^]*)?$/i, 0, "SCHEDULE", match => match[1], { isAnnex: true }),
      CORE.pattern("paragraph-de", /\b(?:§|Paragraph|PARAGRAPH)\s*(\d+[A-Za-z]?(?:\s*[A-Za-z])?)\b[\s.\-—:]*([^]*)?$/i, 2, "SEC", match => match[1]),
      CORE.pattern("subclause-de", /^\s*\((\d{1,3}[a-z]?)\)\s+(.+)$/i, 3, "SUBCL", match => match[1])
    ],
    es: [
      CORE.pattern("schedule-es", /\b(?:Anexo|ANEXO|Apéndice|Apendice|APENDICE)\s+([IVXLCDM]+|\d+|[A-Z])\b[\s.\-—:]*([^]*)?$/i, 0, "SCHEDULE", match => match[1], { isAnnex: true }),
      CORE.pattern("clause-es", /\b(?:Cláusula|Clausula|CLAUSULA)\s+(\d{1,4}[A-Za-z]?(?:\.\d+)?)\b[\s.\-—:]*([^]*)?$/i, 2, "CL", match => match[1]),
      CORE.pattern("article-es", /\b(?:Artículo|Articulo|ARTICULO|Art\.?)\s+(\d{1,4}[A-Za-z]?(?:°|º)?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?)\b[\s.\-—:]*([^]*)?$/i, 2, "ART", match => match[1])
    ]
  };

  const RECITAL_MARKERS = {
    en: /\b(?:WHEREAS|WITNESSETH|NOW\s*,?\s+THEREFORE)\b/i,
    fr: /\b(?:ATTENDU\s+QUE|EXPOSÉ\s+PRÉALABLE|EXPOSE\s+PREALABLE|IL\s+A\s+ÉTÉ\s+CONVENU)\b/i,
    de: /\b(?:IN\s+ERWÄGUNG|IN\s+ERWAEGUNG|WIRD\s+FOLGENDES\s+VEREINBART)\b/i,
    es: /\b(?:CONSIDERANDO|EXPONEN|ACUERDAN)\b/i
  };

  const OPERATIVE_MARKERS = {
    en: /\b(?:NOW\s*,?\s+THEREFORE|The\s+parties\s+agree\s+as\s+follows)\b/i,
    fr: /\b(?:IL\s+A\s+ÉTÉ\s+CONVENU|Les\s+parties\s+conviennent)\b/i,
    de: /\b(?:wird\s+Folgendes\s+vereinbart)\b/i,
    es: /\b(?:ACUERDAN|Las\s+partes\s+acuerdan)\b/i
  };

  const SIGNATURE_MARKERS = {
    en: /\b(?:IN\s+WITNESS\s+WHEREOF|SIGNED\s+(?:by|for\s+and\s+on\s+behalf\s+of)|EXECUTED\s+(?:as\s+a\s+deed|on\s+the\s+date))\b/i,
    fr: /\b(?:FAIT\s+À|FAIT\s+A|SIGNÉ|SIGNE|EN\s+FOI\s+DE\s+QUOI)\b/i,
    de: /\b(?:UNTERSCHRIFT|UNTERZEICHNET|ORT,\s+DATUM)\b/i,
    es: /\b(?:FIRMADO|FIRMA|EN\s+FE\s+DE\s+LO\s+CUAL|HECHO\s+EN)\b/i
  };

  const CONTRACT_REFERENCE_PATTERNS = {
    en: [
      CORE.referencePattern(/\b(?:clause|Clause|Cl\.?)\s+(\d{1,4}[A-Za-z]?(?:\.\d+)?)\b/i, "CL", "clause-reference"),
      CORE.referencePattern(/\b(?:section|Section|s\.)\s+(\d+[A-Za-z]?(?:\.\d+)?)\b/i, "SEC", "section-reference"),
      CORE.referencePattern(/\b(?:schedule|Schedule|Sch\.?|exhibit|Exhibit|appendix|Appendix)\s+([IVXLCDM]+|\d+|[A-Z])\b/i, "SCHEDULE", "schedule-reference"),
      CORE.referencePattern(/\b(?:article|Article|Art\.?)\s+(\d{1,4})\b/i, "ART", "article-reference")
    ],
    fr: [
      CORE.referencePattern(/\b(?:clause|Clause)\s+(\d{1,4}[A-Za-z]?(?:\.\d+)?)\b/i, "CL", "clause-reference"),
      CORE.referencePattern(/\b(?:article|Article|Art\.?)\s+(\d{1,4}(?:er)?)\b/i, "ART", "article-reference")
    ],
    de: [
      CORE.referencePattern(/\b(?:§|Paragraph)\s*(\d+[A-Za-z]?)\b/i, "SEC", "section-reference")
    ],
    es: [
      CORE.referencePattern(/\b(?:cláusula|Cláusula|clausula|Clausula)\s+(\d{1,4}[A-Za-z]?(?:\.\d+)?)\b/i, "CL", "clause-reference")
    ]
  };

  const BOILERPLATE_PATTERNS = {
    "governing-law": {
      en: [/\bgoverning\s+law\b/i, /\bjurisdiction\b/i],
      fr: [/\bdroit\s+applicable\b/i, /\bjuridiction\s+compétente\b/i],
      de: [/\banwendbares\s+Recht\b/i, /\bGerichtsstand\b/i],
      es: [/\bley\s+aplicable\b/i, /\bjurisdicción\b/i]
    },
    "force-majeure": {
      en: [/\bforce\s+majeure\b/i, /\bAct\s+of\s+God\b/i],
      fr: [/\bforce\s+majeure\b/i, /\bcas\s+fortuit\b/i],
      de: [/\bhöhere\s+Gewalt\b/i],
      es: [/\bfuerza\s+mayor\b/i]
    },
    confidentiality: {
      en: [/\bconfidential(?:ity)?\b/i, /\bnon-disclosure\b/i],
      fr: [/\bconfidentialité\b/i, /\bnon-divulgation\b/i],
      de: [/\bVertraulichkeit\b/i, /\bGeheimhaltung\b/i],
      es: [/\bconfidencialidad\b/i]
    },
    termination: {
      en: [/\btermination\b/i, /\bterm\s+and\s+termination\b/i],
      fr: [/\brésiliation\b/i],
      de: [/\bKündigung\b/i],
      es: [/\bterminación\b/i]
    },
    indemnification: {
      en: [/\bindemnif(?:y|ication)\b/i, /\bhold\s+harmless\b/i],
      fr: [/\bindemnisation\b/i],
      de: [/\bFreistellung\b/i],
      es: [/\bindemnización\b/i]
    },
    "entire-agreement": {
      en: [/\bentire\s+agreement\b/i, /\bwhole\s+agreement\b/i],
      fr: [/\bintégralité\s+de\s+l'?accord\b/i],
      de: [/\bgesamte\s+Vereinbarung\b/i],
      es: [/\bintegridad\s+del\s+acuerdo\b/i]
    },
    severability: {
      en: [/\bseverability\b/i, /\bseverable\b/i],
      fr: [/\bdivisibilité\b/i, /\bnullité\s+partielle\b/i],
      de: [/\bSalvatorische\s+Klausel\b/i],
      es: [/\bdivisibilidad\b/i]
    },
    "dispute-resolution": {
      en: [/\bdispute\s+resolution\b/i, /\barbitration\b/i, /\bmediation\b/i],
      fr: [/\brèglement\s+des\s+différends\b/i, /\barbitrage\b/i],
      de: [/\bStreitbeilegung\b/i, /\bSchiedsverfahren\b/i],
      es: [/\bresolución\s+de\s+conflictos\b/i, /\barbitraje\b/i]
    }
  };

  function parse(input, options = {}) {
    const startedAt = Date.now();
    const normalized = CORE.normalizeInput(input);
    const language = CORE.getLanguage(options.language || options.detection?.language || "en");
    const warnings = [];
    const text = normalized.normalizedText;

    if (!text || text.length < 50) {
      warnings.push(CORE.makeWarning("EMPTY_TEXT", "Document text is too short for meaningful contract parsing.", { textLength: text.length }));
      return CORE.createEmptyParseResult({ startedAt, version: VERSION, documentType: DOCUMENT_TYPE, filename: normalized.filename, language, warnings });
    }

    const parties = detectParties(text, language);
    const recitals = detectRecitals(text, language);
    const signatures = detectSignatureBlock(text, language);
    const rawElements = discoverStructure(text, language, normalized.sourceUnits, signatures?.position);

    if (rawElements.length === 0) {
      warnings.push(CORE.makeWarning("NO_STRUCTURE", "No clauses, sections, articles, schedules, or exhibits were detected.", { textLength: text.length, language }));
      return CORE.createEmptyParseResult({ startedAt, version: VERSION, documentType: DOCUMENT_TYPE, filename: normalized.filename, language, warnings });
    }

    const elements = CORE.extractContent(text, rawElements);
    const clauses = elements.filter(element => ["CL", "SEC", "ART"].includes(element.type) && !element.isEmpty);
    const hierarchyElements = elements.filter(element => !["CL", "SEC", "ART"].includes(element.type) || element.isEmpty);
    const allElements = [recitals, ...elements, signatures].filter(Boolean);
    const references = CORE.scanCrossReferences(
      allElements,
      language,
      CONTRACT_REFERENCE_PATTERNS[language] || CONTRACT_REFERENCE_PATTERNS.en,
      { allowedSourceTypes: ["RECITALS", "CL", "SEC", "ART", "SUBCL", "SCHEDULE", "SIGNATURES"], skipNestedContent: true }
    );
    const boilerplateClauses = detectBoilerplateClauses(elements, language);
    const metadata = extractMetadata(text, language, normalized.filename, parties);

    if (clauses.length < MIN_CLAUSE_COUNT_WARNING) {
      warnings.push(CORE.makeWarning("LOW_CLAUSE_COUNT", `Only ${clauses.length} operative clause(s) were parsed. Source may be incomplete, OCR-damaged, or not a contract.`));
    }
    if (!parties.detected) {
      warnings.push(CORE.makeWarning("NO_PARTIES_DETECTED", "No clear contract parties block was detected."));
    }

    return {
      version: VERSION,
      documentType: DOCUMENT_TYPE,
      filename: normalized.filename || "",
      metadata,
      parties,
      preamble: recitals,
      recitals,
      signatures,
      articles: clauses,
      hierarchyElements,
      elements,
      hierarchyTree: CORE.buildHierarchyTree(elements),
      references,
      boilerplateClauses,
      amendments: [],
      warnings,
      stats: {
        totalArticles: clauses.length,
        totalElements: elements.length,
        totalReferences: references.length,
        resolvedReferences: references.filter(reference => reference.resolved).length,
        hasPreamble: Boolean(recitals),
        hasRecitals: Boolean(recitals),
        hasSignatureBlock: Boolean(signatures),
        partiesDetected: parties.parties.length,
        boilerplateClausesDetected: Object.keys(boilerplateClauses).length,
        scheduleCount: elements.filter(element => element.type === "SCHEDULE").length,
        amendmentCount: 0,
        language,
        durationMs: Date.now() - startedAt
      }
    };
  }

  function discoverStructure(text, language, sourceUnits = [], stopPosition = null) {
    const patterns = STRUCTURAL_PATTERNS[language] || STRUCTURAL_PATTERNS.en;
    const lines = String(text || "").split("\n");
    const elements = [];
    let position = 0;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      if (stopPosition !== null && position >= stopPosition) break;
      const trimmed = lines[lineIndex].trim();

      if (trimmed) {
        for (const structurePattern of patterns) {
          const match = trimmed.match(structurePattern.regex);
          if (!match || match.index > 8) continue;
          const identifier = structurePattern.extract(match);
          if (!identifier) continue;

          const normalizedId = CORE.normalizeNumber(identifier, language);
          const canonicalId = CORE.canonicalId(structurePattern.prefix, normalizedId);
          const sourceUnit = CORE.findSourceUnitForHeading(trimmed, sourceUnits);

          elements.push({
            id: canonicalId,
            canonicalId,
            type: structurePattern.prefix,
            prefix: structurePattern.prefix,
            level: structurePattern.level,
            identifier: String(identifier).trim(),
            normalizedId,
            sortKey: CORE.sortKey(structurePattern.prefix, normalizedId),
            position,
            endPosition: null,
            lineIndex,
            heading: trimmed,
            shortTitle: extractHeadingTitle(trimmed, identifier),
            content: "",
            isAnnex: Boolean(structurePattern.isAnnex),
            isAmendment: false,
            isEmpty: true,
            source: CORE.sourceAnchorFromUnit(sourceUnit)
          });
          break;
        }
      }

      position += lines[lineIndex].length + 1;
    }

    return CORE.dedupeBy(elements.sort((a, b) => a.position - b.position), element => `${element.canonicalId}|${element.position}`);
  }

  function detectParties(text, language) {
    const patterns = {
      en: [
        /\b(?:BETWEEN|Between)\s+(.+?)\s+(?:AND|and)\s+(.+?)(?:\s+(?:AND|and)\s+(.+?))?\s*(?:\.|\n|$)/im,
        /\bThis\s+Agreement\s+is\s+(?:made|entered\s+into).+?\s+between\s+(.+?)\s+(?:and|,)\s+(.+?)(?:\.|\n|$)/im
      ],
      fr: [/\b(?:ENTRE|Entre)\s+(.+?)\s+(?:ET|et)\s+(.+?)(?:\.|\n|$)/im],
      de: [/\b(?:ZWISCHEN|Zwischen)\s+(.+?)\s+(?:UND|und)\s+(.+?)(?:\.|\n|$)/im],
      es: [/\b(?:ENTRE|Entre)\s+(.+?)\s+(?:Y|y)\s+(.+?)(?:\.|\n|$)/im]
    };

    const firstBlock = String(text || "").slice(0, 5000);
    for (const regex of patterns[language] || patterns.en) {
      const match = firstBlock.match(regex);
      if (!match) continue;
      const parties = match.slice(1).filter(Boolean).map(cleanPartyName).filter(Boolean);
      if (parties.length >= 2) {
        return { detected: true, parties, matchText: match[0], position: match.index };
      }
    }

    return { detected: false, parties: [], matchText: null, position: null };
  }

  function detectRecitals(text, language) {
    const startMatch = text.match(RECITAL_MARKERS[language] || RECITAL_MARKERS.en);
    if (!startMatch) return null;

    const operativeMatch = text.match(OPERATIVE_MARKERS[language] || OPERATIVE_MARKERS.en);
    const end = operativeMatch && operativeMatch.index > startMatch.index
      ? operativeMatch.index + operativeMatch[0].length
      : findFirstClausePosition(text);
    const content = CORE.extractRegion(text, startMatch.index, end);
    if (content.length < 30) return null;

    return {
      id: "RECITALS",
      canonicalId: "RECITALS",
      type: "RECITALS",
      level: -1,
      heading: "Contract Recitals",
      content,
      position: startMatch.index,
      endPosition: end,
      isEmpty: false
    };
  }

  function detectSignatureBlock(text, language) {
    const match = text.match(SIGNATURE_MARKERS[language] || SIGNATURE_MARKERS.en);
    if (!match) return null;
    const content = CORE.extractRegion(text, match.index, text.length);
    return {
      id: "SIGNATURES",
      canonicalId: "SIGNATURES",
      type: "SIGNATURES",
      level: -1,
      heading: CORE.extractFirstLine(content, 180) || "Signature Block",
      content,
      position: match.index,
      endPosition: text.length,
      isEmpty: content.length < 20
    };
  }

  function findFirstClausePosition(text) {
    const match = text.match(/\b(?:Clause|Section|Article)\s+\d+/i);
    return match ? match.index : Math.min(4000, text.length);
  }

  function detectBoilerplateClauses(elements, language) {
    const tagged = {};
    for (const element of elements) {
      if (!element.content || element.isEmpty) continue;
      for (const [clauseType, patterns] of Object.entries(BOILERPLATE_PATTERNS)) {
        const matched = (patterns[language] || patterns.en || []).filter(regex => regex.test(element.content) || regex.test(element.heading));
        if (matched.length > 0) {
          if (!tagged[clauseType]) tagged[clauseType] = [];
          tagged[clauseType].push({
            elementId: element.canonicalId,
            heading: element.heading,
            matchedPatterns: matched.map(regex => regex.source)
          });
        }
      }
    }
    return tagged;
  }

  function extractMetadata(text, language, filename, parties = detectParties(text, language)) {
    const firstBlock = String(text || "").split("\n").slice(0, 35).join("\n");
    let title = CORE.titleFromFilename(filename);
    let contractType = null;
    let agreementDate = null;

    const typeMatch = firstBlock.match(/\b(Master\s+Services?\s+Agreement|Service\s+Level\s+Agreement|Non-Disclosure\s+Agreement|Employment\s+Agreement|Lease\s+Agreement|Purchase\s+Agreement|License\s+Agreement|Distribution\s+Agreement|Partnership\s+Agreement|Agreement|Contract)\b/i);
    if (typeMatch) contractType = typeMatch[1];

    for (const line of firstBlock.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length < 10 || trimmed.length > 220) continue;
      if (/^(BETWEEN|WHEREAS|CLAUSE|SECTION|ARTICLE)\b/i.test(trimmed)) continue;
      if (/\b(Agreement|Contract|Deed|Terms|Services|License|Lease|Purchase|Employment)\b/i.test(trimmed) || trimmed === trimmed.toUpperCase()) {
        title = trimmed;
        break;
      }
    }

    const dateMatch = firstBlock.match(/\b(?:dated|Dated|made|entered\s+into)\s+(?:as\s+of\s+)?(\d{1,2}\s+\w+\s+\d{4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{4})\b/i) ||
      firstBlock.match(/\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i);
    if (dateMatch) agreementDate = dateMatch[1] || dateMatch[0];

    return {
      title: title || contractType || "Untitled Agreement",
      contractType,
      agreementDate,
      parties: parties.parties,
      language,
      sourceFilename: filename || null
    };
  }

  function cleanPartyName(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/,$/, "")
      .trim();
  }

  function extractHeadingTitle(heading, identifier) {
    const escaped = CORE.escapeRegex(String(identifier || ""));
    const regex = new RegExp(`^(?:SCHEDULE|Schedule|EXHIBIT|Exhibit|APPENDIX|Appendix|PART|Part|CLAUSE|Clause|CL\\.?|SECTION|Section|ARTICLE|Article)\\s+${escaped}\\s*[.\\-—:]*\\s*`, "i");
    const title = String(heading || "").replace(regex, "").trim();
    return title || null;
  }

  function summarize(parsed) {
    const parts = [];
    if (parsed.metadata.title) parts.push(parsed.metadata.title);
    if (parsed.stats.partiesDetected > 0) parts.push(`${parsed.stats.partiesDetected} part(ies)`);
    parts.push(`${parsed.stats.totalArticles} operative clause(s)`);
    if (parsed.stats.boilerplateClausesDetected > 0) parts.push(`${parsed.stats.boilerplateClausesDetected} boilerplate type(s)`);
    return parts.join(" · ");
  }

  return {
    VERSION,
    DOCUMENT_TYPE,
    STRUCTURAL_PATTERNS,
    CONTRACT_REFERENCE_PATTERNS,
    BOILERPLATE_PATTERNS,
    parse,
    summarize,
    discoverStructure,
    detectParties,
    detectRecitals,
    detectSignatureBlock,
    detectBoilerplateClauses,
    extractMetadata
  };
});
