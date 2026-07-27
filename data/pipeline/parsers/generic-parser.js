/**
 * ATLAS Ingestion Pipeline - Generic Parser
 *
 * Fallback parser for documents that cannot be confidently classified.
 *
 * Legal posture:
 * - do not infer a legal type
 * - preserve text and source anchors as much as possible
 * - extract obvious structure when present
 * - fall back to paragraph blocks with explicit warnings
 */

(function initAtlasGenericParser(root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./_core.js"));
    return;
  }

  if (!root.ATLAS_ParserCore) {
    throw new Error("[generic-parser] ATLAS_ParserCore must be loaded before this module.");
  }

  root.ATLAS_GenericParser = factory(root.ATLAS_ParserCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function createAtlasGenericParser(CORE) {
  "use strict";

  const VERSION = "1.0.0";
  const DOCUMENT_TYPE = "unknown";

  const UNIVERSAL_PATTERNS = {
    en: [
      CORE.pattern("article-en", /\b(?:Article|ARTICLE|Art\.?)\s+([IVXLCDM]+|\d{1,4}[A-Za-z]?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?)\b[\s.\-—:]*([^]*)?$/i, 4, "ART", match => match[1]),
      CORE.pattern("section-en", /\b(?:Section|SECTION|Sec\.?|§)\s*(\d+[A-Za-z]?(?:\.\d+)?)\b[\s.\-—:]*([^]*)?$/i, 3, "SEC", match => match[1]),
      CORE.pattern("clause-en", /\b(?:Clause|CLAUSE|Cl\.?)\s+(\d{1,4}[A-Za-z]?(?:\.\d+)?)\b[\s.\-—:]*([^]*)?$/i, 3, "CL", match => match[1]),
      CORE.pattern("numbered-para-en", /^\s*(\d{1,4}[A-Za-z]?)\.\s+(.+)$/i, 4, "PARA", match => match[1]),
      CORE.pattern("paren-para-en", /^\s*\((\d{1,3}[a-z]?|[a-z]|[ivxlcdm]+)\)\s+(.+)$/i, 5, "SUBPARA", match => match[1]),
      CORE.pattern("chapter-en", /\b(?:Chapter|CHAPTER|Ch\.?)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 1, "CH", match => match[1]),
      CORE.pattern("title-en", /\b(?:Title|TITLE|Tit\.?)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "TITLE", match => match[1]),
      CORE.pattern("part-en", /\b(?:Part|PART|Pt\.?)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "PART", match => match[1]),
      CORE.pattern("schedule-en", /\b(?:Schedule|SCHEDULE|Annex|ANNEX|Exhibit|EXHIBIT|Appendix|APPENDIX)\s+([IVXLCDM]+|\d+|[A-Z])\b[\s.\-—:]*([^]*)?$/i, 0, "SCHEDULE", match => match[1], { isAnnex: true })
    ],
    fr: [
      CORE.pattern("article-fr", /\b(?:Article|ARTICLE|Art\.?)\s+(\d{1,4}(?:er|ère|eme|ème)?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?(?:\s*(?:bis|ter|quater))?)\b[\s.\-—:]*([^]*)?$/i, 4, "ART", match => match[1]),
      CORE.pattern("section-fr", /\b(?:Section|SECTION)\s+(\d+[A-Za-z]?)\b[\s.\-—:]*([^]*)?$/i, 3, "SEC", match => match[1]),
      CORE.pattern("title-fr", /\b(?:Titre|TITRE)\s+([IVXLCDM]+|\d+)(?:er|ère|eme|ème)?\b[\s.\-—:]*([^]*)?$/i, 0, "TITLE", match => match[1]),
      CORE.pattern("chapter-fr", /\b(?:Chapitre|CHAPITRE)\s+([IVXLCDM]+|\d+)(?:er|ère|eme|ème)?\b[\s.\-—:]*([^]*)?$/i, 1, "CH", match => match[1]),
      CORE.pattern("part-fr", /\b(?:Partie|PARTIE)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "PART", match => match[1]),
      CORE.pattern("annex-fr", /\b(?:Annexe|ANNEXE|Pièce|PIÈCE)\s+([IVXLCDM]+|\d+|[A-Z])\b[\s.\-—:]*([^]*)?$/i, 0, "SCHEDULE", match => match[1], { isAnnex: true })
    ],
    de: [
      CORE.pattern("article-de", /\b(?:Artikel|ARTIKEL|Art\.?)\s+(\d{1,4}[A-Za-z]?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?)\b[\s.\-—:]*([^]*)?$/i, 4, "ART", match => match[1]),
      CORE.pattern("paragraph-de", /\b(?:§|Paragraph|PARAGRAPH)\s*(\d+[A-Za-z]?(?:\s*[A-Za-z])?)\b[\s.\-—:]*([^]*)?$/i, 3, "SEC", match => match[1]),
      CORE.pattern("chapter-de", /\b(?:Kapitel|KAPITEL|Abschnitt|ABSCHNITT)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 1, "CH", match => match[1]),
      CORE.pattern("part-de", /\b(?:Teil|TEIL)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "PART", match => match[1])
    ],
    es: [
      CORE.pattern("article-es", /\b(?:Artículo|Articulo|ARTICULO|Art\.?)\s+(\d{1,4}[A-Za-z]?(?:°|º)?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?)\b[\s.\-—:]*([^]*)?$/i, 4, "ART", match => match[1]),
      CORE.pattern("section-es", /\b(?:Sección|Seccion|SECCION)\s+(\d+[A-Za-z]?)\b[\s.\-—:]*([^]*)?$/i, 3, "SEC", match => match[1]),
      CORE.pattern("chapter-es", /\b(?:Capítulo|Capitulo|CAPITULO)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 1, "CH", match => match[1])
    ]
  };

  function parse(input, options = {}) {
    const startedAt = Date.now();
    const normalized = CORE.normalizeInput(input);
    const language = CORE.getLanguage(options.language || options.detection?.language || "en");
    const warnings = [
      CORE.makeWarning("GENERIC_PARSER_USED", "Document type was not confidently classified; generic structure extraction was used.")
    ];
    const text = normalized.normalizedText;

    if (!text || text.length < 20) {
      warnings.push(CORE.makeWarning("EMPTY_TEXT", "Document text is too short for meaningful generic parsing.", { textLength: text.length }));
      return CORE.createEmptyParseResult({ startedAt, version: VERSION, documentType: DOCUMENT_TYPE, filename: normalized.filename, language, warnings });
    }

    const rawElements = discoverStructure(text, language, normalized.sourceUnits);
    const elements = rawElements.length > 0
      ? CORE.extractContent(text, rawElements)
      : createFallbackBlocks(text, normalized.sourceUnits, warnings);

    const coreElements = elements.filter(element => ["ART", "SEC", "CL", "PARA", "BLOCK"].includes(element.type) && !element.isEmpty);
    const hierarchyElements = elements.filter(element => !["ART", "SEC", "CL", "PARA", "BLOCK"].includes(element.type) || element.isEmpty);
    const references = rawElements.length > 0 ? CORE.scanCrossReferences(elements, language) : [];
    const metadata = extractMetadata(text, language, normalized.filename);

    return {
      version: VERSION,
      documentType: DOCUMENT_TYPE,
      filename: normalized.filename || "",
      metadata,
      preamble: null,
      articles: coreElements,
      hierarchyElements,
      elements,
      hierarchyTree: CORE.buildHierarchyTree(elements),
      references,
      amendments: [],
      warnings,
      stats: {
        totalArticles: coreElements.length,
        totalElements: elements.length,
        totalReferences: references.length,
        resolvedReferences: references.filter(reference => reference.resolved).length,
        hasPreamble: false,
        amendmentCount: 0,
        language,
        fallbackMode: rawElements.length === 0,
        durationMs: Date.now() - startedAt
      }
    };
  }

  function discoverStructure(text, language, sourceUnits = []) {
    const patterns = UNIVERSAL_PATTERNS[language] || UNIVERSAL_PATTERNS.en;
    const lines = String(text || "").split("\n");
    const elements = [];
    let position = 0;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
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
            shortTitle: match[2] ? match[2].trim() : null,
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

  function createFallbackBlocks(text, sourceUnits, warnings) {
    warnings.push(CORE.makeWarning("NO_STRUCTURE", "No structural elements detected; falling back to paragraph blocks."));
    const blocks = String(text || "").split(/\n\n+/).filter(block => block.trim().length > 0);
    let searchFrom = 0;

    return blocks.map((block, index) => {
      const foundAt = text.indexOf(block, searchFrom);
      const position = foundAt >= 0 ? foundAt : searchFrom;
      searchFrom = position + block.length;
      const identifier = String(index + 1);
      const normalizedId = identifier.padStart(4, "0");
      const sourceUnit = sourceUnits[index] || null;
      const content = CORE.normalizeText(block);

      return {
        id: `BLOCK-${normalizedId}`,
        canonicalId: `BLOCK-${normalizedId}`,
        type: "BLOCK",
        prefix: "BLOCK",
        level: 9,
        identifier,
        normalizedId,
        sortKey: `BLOCK-${normalizedId}`,
        position,
        endPosition: position + block.length,
        lineIndex: index,
        heading: CORE.extractFirstLine(content, 180) || `Block ${identifier}`,
        shortTitle: null,
        content,
        isAnnex: false,
        isAmendment: false,
        isEmpty: content.length < 20,
        source: CORE.sourceAnchorFromUnit(sourceUnit)
      };
    });
  }

  function extractMetadata(text, language, filename) {
    const firstBlock = String(text || "").split("\n").slice(0, 25).join("\n");
    let title = CORE.titleFromFilename(filename);
    let bestGuessType = "Unknown legal document";

    for (const line of firstBlock.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length < 10 || trimmed.length > 250) continue;
      if (/^(Article|Section|Clause|Chapter|Part|Title|ARTICLE|SECTION|CLAUSE|CHAPTER|PART|TITLE)\b/i.test(trimmed)) continue;
      const letters = trimmed.replace(/[^A-Za-zÀ-ÿ]/g, "");
      const uppercase = trimmed.replace(/[^A-ZÀ-Ý]/g, "");
      if (letters && uppercase.length / Math.max(letters.length, 1) > 0.4) {
        title = trimmed;
        break;
      }
    }

    if (/\b(?:Article|ARTICLE)\s+\d{1,4}\b/.test(firstBlock)) bestGuessType = "Structured legal document (articles detected)";
    else if (/\b(?:Section|SECTION)\s+\d+\b/.test(firstBlock)) bestGuessType = "Structured legal document (sections detected)";
    else if (/\b(?:Clause|CLAUSE)\s+\d+\b/.test(firstBlock)) bestGuessType = "Structured legal document (clauses detected)";
    else if (/\b(?:WHEREAS|BETWEEN)\b/.test(firstBlock)) bestGuessType = "Possible contract or agreement";

    return {
      title: title || "Untitled Legal Document",
      bestGuessType,
      language,
      sourceFilename: filename || null
    };
  }

  function summarize(parsed) {
    const parts = [];
    if (parsed.metadata.title) parts.push(parsed.metadata.title);
    parts.push(parsed.stats.fallbackMode ? "fallback blocks" : "generic structure");
    parts.push(`${parsed.stats.totalElements} element(s)`);
    return parts.join(" · ");
  }

  return {
    VERSION,
    DOCUMENT_TYPE,
    UNIVERSAL_PATTERNS,
    parse,
    summarize,
    discoverStructure,
    extractMetadata,
    createFallbackBlocks
  };
});
