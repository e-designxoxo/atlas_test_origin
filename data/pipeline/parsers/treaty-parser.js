/**
 * ATLAS Ingestion Pipeline - Treaty Parser
 *
 * Parses international treaties, conventions, and agreements into structured,
 * source-grounded legal data.
 *
 * Treaty-specific priorities:
 * - detect diplomatic preamble and closing/signature formula
 * - preserve parts, protocols, chapters, articles, and annexes
 * - identify contracting parties and depositary/authentic-language clauses
 * - avoid treating signature blocks as ordinary articles
 */

(function initAtlasTreatyParser(root, factory) {
  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    module.exports = factory(require("./_core.js"));
    return;
  }

  if (!root.ATLAS_ParserCore) {
    throw new Error("[treaty-parser] ATLAS_ParserCore must be loaded before this module.");
  }

  root.ATLAS_TreatyParser = factory(root.ATLAS_ParserCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function createAtlasTreatyParser(CORE) {
  "use strict";

  const VERSION = "1.0.0";
  const DOCUMENT_TYPE = "treaty";
  const MIN_ARTICLE_COUNT_WARNING = 2;

  const STRUCTURAL_PATTERNS = {
    en: [
      CORE.pattern("part-en", /\b(?:Part|PART)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "PART", match => match[1]),
      CORE.pattern("protocol-en", /\b(?:Protocol|PROTOCOL)\s+([IVXLCDM]+|\d+|[A-Z])\b[\s.\-—:]*([^]*)?$/i, 0, "PROTOCOL", match => match[1]),
      CORE.pattern("title-en", /\b(?:Title|TITLE)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 1, "TITLE", match => match[1]),
      CORE.pattern("chapter-en", /\b(?:Chapter|CHAPTER)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 2, "CH", match => match[1]),
      CORE.pattern("section-en", /\b(?:Section|SECTION)\s+(\d+[A-Za-z]?)\b[\s.\-—:]*([^]*)?$/i, 2, "SEC", match => match[1]),
      CORE.pattern("article-en", /\b(?:Article|ARTICLE)\s+([IVXLCDM]+|\d{1,4}[A-Za-z]?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?(?:\s*(?:bis|ter|quater))?)\b[\s.\-—:]*([^]*)?$/i, 3, "ART", match => match[1]),
      CORE.pattern("annex-en", /\b(?:Annex|ANNEX)\s+([IVXLCDM]+|\d+|[A-Z])\b[\s.\-—:]*([^]*)?$/i, 0, "ANNEX", match => match[1], { isAnnex: true })
    ],
    fr: [
      CORE.pattern("part-fr", /\b(?:Partie|PARTIE)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "PART", match => match[1]),
      CORE.pattern("protocol-fr", /\b(?:Protocole|PROTOCOLE)\s+([IVXLCDM]+|\d+|[A-Z])\b[\s.\-—:]*([^]*)?$/i, 0, "PROTOCOL", match => match[1]),
      CORE.pattern("title-fr", /\b(?:Titre|TITRE)\s+([IVXLCDM]+|\d+)(?:er|ère|eme|ème)?\b[\s.\-—:]*([^]*)?$/i, 1, "TITLE", match => match[1]),
      CORE.pattern("chapter-fr", /\b(?:Chapitre|CHAPITRE)\s+([IVXLCDM]+|\d+)(?:er|ère|eme|ème)?\b[\s.\-—:]*([^]*)?$/i, 2, "CH", match => match[1]),
      CORE.pattern("article-fr", /\b(?:Article|ARTICLE|Art\.?)\s+(\d{1,4}(?:er|ère|eme|ème)?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?(?:\s*(?:bis|ter|quater))?)\b[\s.\-—:]*([^]*)?$/i, 3, "ART", match => match[1]),
      CORE.pattern("annex-fr", /\b(?:Annexe|ANNEXE)\s+([IVXLCDM]+|\d+|[A-Z])\b[\s.\-—:]*([^]*)?$/i, 0, "ANNEX", match => match[1], { isAnnex: true })
    ],
    de: [
      CORE.pattern("part-de", /\b(?:Teil|TEIL)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "PART", match => match[1]),
      CORE.pattern("protocol-de", /\b(?:Protokoll|PROTOKOLL)\s+([IVXLCDM]+|\d+|[A-Z])\b[\s.\-—:]*([^]*)?$/i, 0, "PROTOCOL", match => match[1]),
      CORE.pattern("title-de", /\b(?:Titel|TITEL)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 1, "TITLE", match => match[1]),
      CORE.pattern("chapter-de", /\b(?:Kapitel|KAPITEL)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 2, "CH", match => match[1]),
      CORE.pattern("article-de", /\b(?:Artikel|ARTIKEL|Art\.?)\s+(\d{1,4}[A-Za-z]?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?)\b[\s.\-—:]*([^]*)?$/i, 3, "ART", match => match[1])
    ],
    es: [
      CORE.pattern("part-es", /\b(?:Parte|PARTE)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "PART", match => match[1]),
      CORE.pattern("protocol-es", /\b(?:Protocolo|PROTOCOLO)\s+([IVXLCDM]+|\d+|[A-Z])\b[\s.\-—:]*([^]*)?$/i, 0, "PROTOCOL", match => match[1]),
      CORE.pattern("title-es", /\b(?:Título|Titulo|TITULO)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 1, "TITLE", match => match[1]),
      CORE.pattern("chapter-es", /\b(?:Capítulo|Capitulo|CAPITULO)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 2, "CH", match => match[1]),
      CORE.pattern("article-es", /\b(?:Artículo|Articulo|ARTICULO|Art\.?)\s+(\d{1,4}[A-Za-z]?(?:°|º)?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?)\b[\s.\-—:]*([^]*)?$/i, 3, "ART", match => match[1])
    ]
  };

  const PREAMBLE_START_MARKERS = {
    en: /\b(?:The\s+(?:High\s+)?Contracting\s+Parties|The\s+Parties\s+to\s+this|Desiring\s+to|Recognizing\s+that|Considering\s+that)\b/i,
    fr: /\b(?:Les\s+(?:Hautes\s+)?Parties\s+contractantes|Désireuses\s+de|Reconnaissant\s+que|Considérant\s+que)\b/i,
    de: /\b(?:Die\s+Vertrags(?:parteien|staaten)|in\s+dem\s+Wunsch|in\s+der\s+Erkenntnis)\b/i,
    es: /\b(?:Las\s+(?:Altas\s+)?Partes\s+Contratantes|Deseando|Reconociendo|Considerando)\b/i
  };

  const AGREEMENT_MARKERS = {
    en: /\b(?:Have\s+agreed\s+as\s+follows|Agree\s+as\s+follows)\s*:/i,
    fr: /\b(?:Sont\s+convenu(?:e)?s?\s+de\s+ce\s+qui\s+suit)\s*:/i,
    de: /\b(?:sind\s+wie\s+folgt\s+übereingekommen)\s*:/i,
    es: /\b(?:Han\s+convenido\s+lo\s+siguiente)\s*:/i
  };

  const CLOSING_MARKERS = {
    en: /\b(?:IN\s+WITNESS\s+WHEREOF|Done\s+at|DONE\s+at)\b/i,
    fr: /\b(?:EN\s+FOI\s+DE\s+QUOI|Fait\s+à|FAIT\s+à)\b/i,
    de: /\b(?:ZU\s+URKUND\s+DESSEN|Geschehen\s+zu)\b/i,
    es: /\b(?:EN\s+FE\s+DE\s+LO\s+CUAL|Hecho\s+en)\b/i
  };

  const TREATY_REFERENCE_PATTERNS = {
    en: [
      CORE.referencePattern(/\b(?:Protocol|PROTOCOL)\s+([IVXLCDM]+|\d+|[A-Z])\b/i, "PROTOCOL", "protocol-reference"),
      CORE.referencePattern(/\b(?:Annex|ANNEX)\s+([IVXLCDM]+|\d+|[A-Z])\b/i, "ANNEX", "annex-reference"),
      CORE.referencePattern(/\b(?:Convention|Treaty|Agreement)\s+(?:of\s+)?(\d{4})\b/i, "TREATY", "treaty-reference")
    ],
    fr: [
      CORE.referencePattern(/\b(?:Protocole|PROTOCOLE)\s+([IVXLCDM]+|\d+|[A-Z])\b/i, "PROTOCOL", "protocol-reference"),
      CORE.referencePattern(/\b(?:Annexe|ANNEXE)\s+([IVXLCDM]+|\d+|[A-Z])\b/i, "ANNEX", "annex-reference")
    ],
    de: [],
    es: []
  };

  function parse(input, options = {}) {
    const startedAt = Date.now();
    const normalized = CORE.normalizeInput(input);
    const language = CORE.getLanguage(options.language || options.detection?.language || "en");
    const warnings = [];
    const text = normalized.normalizedText;

    if (!text || text.length < 50) {
      warnings.push(CORE.makeWarning("EMPTY_TEXT", "Document text is too short for meaningful treaty parsing.", { textLength: text.length }));
      return CORE.createEmptyParseResult({ startedAt, version: VERSION, documentType: DOCUMENT_TYPE, filename: normalized.filename, language, warnings });
    }

    const preamble = detectTreatyPreamble(text, language);
    const closing = detectClosingFormula(text, language);
    const rawElements = discoverStructure(text, language, normalized.sourceUnits, closing?.position);

    if (rawElements.length === 0) {
      warnings.push(CORE.makeWarning("NO_STRUCTURE", "No treaty articles, parts, protocols, or annexes were detected.", { textLength: text.length, language }));
      return CORE.createEmptyParseResult({ startedAt, version: VERSION, documentType: DOCUMENT_TYPE, filename: normalized.filename, language, warnings });
    }

    const elements = CORE.extractContent(text, rawElements);
    const articles = elements.filter(element => element.type === "ART" && !element.isEmpty);
    const hierarchyElements = elements.filter(element => element.type !== "ART" || element.isEmpty);
    const allElements = [preamble, ...elements, closing].filter(Boolean);
    const references = CORE.scanCrossReferences(
      allElements,
      language,
      TREATY_REFERENCE_PATTERNS[language] || TREATY_REFERENCE_PATTERNS.en,
      { allowedSourceTypes: ["TREATY_PREAMBLE", "ART", "SEC", "PROTOCOL", "ANNEX", "CLOSING"], skipNestedContent: true }
    );
    const metadata = extractMetadata(text, language, normalized.filename, preamble, closing);

    if (articles.length < MIN_ARTICLE_COUNT_WARNING) {
      warnings.push(CORE.makeWarning("LOW_ARTICLE_COUNT", `Only ${articles.length} article(s) were parsed. Source may be incomplete, OCR-damaged, or not a treaty.`));
    }

    return {
      version: VERSION,
      documentType: DOCUMENT_TYPE,
      filename: normalized.filename || "",
      metadata,
      preamble,
      closing,
      articles,
      hierarchyElements,
      elements,
      hierarchyTree: CORE.buildHierarchyTree(elements),
      references,
      amendments: [],
      warnings,
      stats: {
        totalArticles: articles.length,
        totalElements: elements.length,
        totalReferences: references.length,
        resolvedReferences: references.filter(reference => reference.resolved).length,
        hasPreamble: Boolean(preamble),
        hasClosingFormula: Boolean(closing),
        partyCount: metadata.parties.length,
        protocolCount: elements.filter(element => element.type === "PROTOCOL").length,
        annexCount: elements.filter(element => element.type === "ANNEX").length,
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

  function detectTreatyPreamble(text, language) {
    const startMatch = text.match(PREAMBLE_START_MARKERS[language] || PREAMBLE_START_MARKERS.en);
    const agreementMatch = text.match(AGREEMENT_MARKERS[language] || AGREEMENT_MARKERS.en);
    if (!startMatch && !agreementMatch) return null;

    const start = startMatch ? startMatch.index : 0;
    const end = agreementMatch ? agreementMatch.index + agreementMatch[0].length : findFirstArticlePosition(text);
    if (end <= start) return null;

    const content = CORE.extractRegion(text, start, end);
    if (content.length < 40) return null;

    return {
      id: "TREATY_PREAMBLE",
      canonicalId: "TREATY_PREAMBLE",
      type: "TREATY_PREAMBLE",
      level: -1,
      heading: CORE.extractFirstLine(content, 180) || "Treaty Preamble",
      content,
      position: start,
      endPosition: end,
      isEmpty: false
    };
  }

  function detectClosingFormula(text, language) {
    const match = text.match(CLOSING_MARKERS[language] || CLOSING_MARKERS.en);
    if (!match) return null;

    const content = CORE.extractRegion(text, match.index, text.length);
    return {
      id: "CLOSING",
      canonicalId: "CLOSING",
      type: "CLOSING",
      level: -1,
      heading: CORE.extractFirstLine(content, 180) || "Closing Formula",
      content,
      position: match.index,
      endPosition: text.length,
      isEmpty: content.length < 20
    };
  }

  function findFirstArticlePosition(text) {
    const match = text.match(/\b(?:Article|ARTICLE|Article|Artículo|Artikel)\s+([IVXLCDM]+|\d+)/);
    return match ? match.index : Math.min(4000, text.length);
  }

  function extractMetadata(text, language, filename, preamble, closing) {
    const firstBlock = String(text || "").split("\n").slice(0, 30).join("\n");
    const lines = firstBlock.split("\n");
    let title = CORE.titleFromFilename(filename);
    let signatureDate = null;
    let signaturePlace = null;
    let depositary = null;
    const parties = extractParties(preamble?.content || firstBlock);
    const authenticLanguages = extractAuthenticLanguages(closing?.content || text);

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 12 || trimmed.length > 240) continue;
      if (/\b(Treaty|Convention|Agreement|Protocol|Charter)\b/i.test(trimmed) || trimmed === trimmed.toUpperCase()) {
        title = trimmed;
        break;
      }
    }

    const placeDateMatch = (closing?.content || text).match(/\bDone\s+at\s+([^,.\n]+),?\s+(?:on\s+)?(\d{1,2}\s+\w+\s+\d{4}|\d{4})\b/i);
    if (placeDateMatch) {
      signaturePlace = placeDateMatch[1].trim();
      signatureDate = placeDateMatch[2].trim();
    } else {
      const dateMatch = text.match(/\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i);
      if (dateMatch) signatureDate = dateMatch[0];
    }

    const depositaryMatch = text.match(/\bdepositary\s+(?:shall\s+be|is)\s+([^.\n]+)/i);
    if (depositaryMatch) depositary = depositaryMatch[1].trim();

    return {
      title: title || "Untitled Treaty",
      jurisdiction: "International",
      adoptionDate: signatureDate,
      signatureDate,
      signaturePlace,
      depositary,
      parties,
      authenticLanguages,
      language,
      sourceFilename: filename || null
    };
  }

  function extractParties(text) {
    const partySignals = String(text || "").match(/\b(?:States|Parties|Contracting Parties|High Contracting Parties|European Union|United Nations)\b/gi);
    return CORE.dedupeBy(partySignals || [], item => item.toLowerCase()).slice(0, 12);
  }

  function extractAuthenticLanguages(text) {
    const match = String(text || "").match(/\b(?:English|French|Spanish|Arabic|Chinese|Russian|German)\b(?:,\s*(?:English|French|Spanish|Arabic|Chinese|Russian|German)\b)*/i);
    if (!match) return [];
    return CORE.dedupeBy(match[0].split(/\s*,\s*/), item => item.toLowerCase());
  }

  function extractHeadingTitle(heading, identifier) {
    const escaped = CORE.escapeRegex(String(identifier || ""));
    const regex = new RegExp(`^(?:PART|Part|PROTOCOL|Protocol|TITLE|Title|CHAPTER|Chapter|SECTION|Section|ARTICLE|Article|ANNEX|Annex)\\s+${escaped}\\s*[.\\-—:]*\\s*`, "i");
    const title = String(heading || "").replace(regex, "").trim();
    return title || null;
  }

  function summarize(parsed) {
    const parts = [];
    if (parsed.metadata.title) parts.push(parsed.metadata.title);
    parts.push(`${parsed.stats.totalArticles} article(s)`);
    if (parsed.stats.hasPreamble) parts.push("preamble detected");
    if (parsed.stats.hasClosingFormula) parts.push("closing formula detected");
    if (parsed.stats.partyCount > 0) parts.push(`${parsed.stats.partyCount} party signal(s)`);
    return parts.join(" · ");
  }

  return {
    VERSION,
    DOCUMENT_TYPE,
    STRUCTURAL_PATTERNS,
    TREATY_REFERENCE_PATTERNS,
    parse,
    summarize,
    discoverStructure,
    detectTreatyPreamble,
    detectClosingFormula,
    extractMetadata
  };
});
