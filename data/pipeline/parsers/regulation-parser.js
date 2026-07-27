/**
 * ATLAS Ingestion Pipeline - Regulation Parser
 *
 * Parses EU regulations and similarly structured regulations into structured,
 * source-grounded legal data.
 *
 * Regulation-specific priorities:
 * - detect recitals separately from articles
 * - preserve chapter / section / article / paragraph hierarchy
 * - detect annexes
 * - extract EU regulation metadata such as instrument number and adopting body
 * - detect internal and external cross-references without legal reasoning
 */

(function initAtlasRegulationParser(root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./_core.js"));
    return;
  }

  if (!root.ATLAS_ParserCore) {
    throw new Error("[regulation-parser] ATLAS_ParserCore must be loaded before this module.");
  }

  root.ATLAS_RegulationParser = factory(root.ATLAS_ParserCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function createAtlasRegulationParser(CORE) {
  "use strict";

  const VERSION = "1.0.0";
  const DOCUMENT_TYPE = "regulation";
  const MIN_ARTICLE_COUNT_WARNING = 3;

  const STRUCTURAL_PATTERNS = {
    en: [
      CORE.pattern("chapter-en", /\b(?:Chapter|CHAPTER)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "CH", match => match[1]),
      CORE.pattern("section-en", /\b(?:Section|SECTION)\s+(\d+[A-Za-z]?)\b[\s.\-—:]*([^]*)?$/i, 1, "SEC", match => match[1]),
      CORE.pattern("article-en", /\b(?:Article|ARTICLE)\s+(\d{1,4}[A-Za-z]?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?)\b[\s.\-—:]*([^]*)?$/i, 2, "ART", match => match[1]),
      CORE.pattern("annex-en", /\b(?:Annex|ANNEX)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "ANNEX", match => match[1], { isAnnex: true })
    ],
    fr: [
      CORE.pattern("chapter-fr", /\b(?:Chapitre|CHAPITRE)\s+([IVXLCDM]+|\d+)(?:er|ère|eme|ème)?\b[\s.\-—:]*([^]*)?$/i, 0, "CH", match => match[1]),
      CORE.pattern("section-fr", /\b(?:Section|SECTION)\s+(\d+[A-Za-z]?)\b[\s.\-—:]*([^]*)?$/i, 1, "SEC", match => match[1]),
      CORE.pattern("article-fr", /\b(?:Article|ARTICLE|Art\.?)\s+(\d{1,4}(?:er|ère|eme|ème)?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?)\b[\s.\-—:]*([^]*)?$/i, 2, "ART", match => match[1]),
      CORE.pattern("annex-fr", /\b(?:Annexe|ANNEXE)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "ANNEX", match => match[1], { isAnnex: true })
    ],
    de: [
      CORE.pattern("chapter-de", /\b(?:Kapitel|KAPITEL)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "CH", match => match[1]),
      CORE.pattern("section-de", /\b(?:Abschnitt|ABSCHNITT)\s+(\d+[A-Za-z]?)\b[\s.\-—:]*([^]*)?$/i, 1, "SEC", match => match[1]),
      CORE.pattern("article-de", /\b(?:Artikel|ARTIKEL|Art\.?)\s+(\d{1,4}[A-Za-z]?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?)\b[\s.\-—:]*([^]*)?$/i, 2, "ART", match => match[1]),
      CORE.pattern("annex-de", /\b(?:Anhang|ANHANG)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "ANNEX", match => match[1], { isAnnex: true })
    ],
    es: [
      CORE.pattern("chapter-es", /\b(?:Capítulo|Capitulo|CAPITULO)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "CH", match => match[1]),
      CORE.pattern("section-es", /\b(?:Sección|Seccion|SECCION)\s+(\d+[A-Za-z]?)\b[\s.\-—:]*([^]*)?$/i, 1, "SEC", match => match[1]),
      CORE.pattern("article-es", /\b(?:Artículo|Articulo|ARTICULO|Art\.?)\s+(\d{1,4}[A-Za-z]?(?:°|º)?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?)\b[\s.\-—:]*([^]*)?$/i, 2, "ART", match => match[1]),
      CORE.pattern("annex-es", /\b(?:Anexo|ANEXO)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "ANNEX", match => match[1], { isAnnex: true })
    ]
  };

  const ENACTING_MARKERS = {
    en: /\b(?:HAVE|HAS)\s+ADOPTED\s+THIS\s+REGULATION\s*:/i,
    fr: /\b(?:ONT|A)\s+ADOPTÉ\s+LE\s+PRÉSENT\s+RÈGLEMENT\s*:/i,
    de: /\b(?:HABEN|HAT)\s+FOLGENDE\s+VERORDNUNG\s+ERLASSEN\s*:/i,
    es: /\b(?:HAN|HA)\s+ADOPTADO\s+EL\s+PRESENTE\s+REGLAMENTO\s*:/i
  };

  const RECITAL_START_MARKERS = {
    en: /\b(?:Whereas|Having\s+regard\s+to|After\s+consulting|Acting\s+in\s+accordance\s+with)\b/i,
    fr: /\b(?:considérant|vu\s+le|après\s+consultation|statuant\s+conformément)\b/i,
    de: /\b(?:in\s+Erwägung|gestützt\s+auf|nach\s+Stellungnahme)\b/i,
    es: /\b(?:considerando|visto\s+el|previa\s+consulta)\b/i
  };

  const REGULATION_REFERENCE_PATTERNS = {
    en: [
      CORE.referencePattern(/\b(?:Regulation|REGULATION)\s+\(?(?:EU|EC|Euratom)\)?\s*(?:No\.?\s*)?(\d{1,4}\/\d{1,4})\b/i, "REG", "regulation-reference"),
      CORE.referencePattern(/\b(?:Directive|DIRECTIVE)\s+(\d{4}\/\d{1,4}\/?(?:EU|EC)?)\b/i, "DIR", "directive-reference"),
      CORE.referencePattern(/\b(?:Annex|ANNEX)\s+([IVXLCDM]+|\d+)\b/i, "ANNEX", "annex-reference"),
      CORE.referencePattern(/\b(?:recital|Recital)\s+\(?(\d{1,3})\)?\b/i, "RECITAL", "recital-reference")
    ],
    fr: [
      CORE.referencePattern(/\b(?:règlement|Règlement|reglement|Reglement)\s+\(?(?:UE|CE|Euratom)\)?\s*(?:n°?\s*)?(\d{1,4}\/\d{1,4})\b/i, "REG", "regulation-reference"),
      CORE.referencePattern(/\b(?:directive|Directive)\s+(\d{4}\/\d{1,4}\/?(?:UE|CE)?)\b/i, "DIR", "directive-reference"),
      CORE.referencePattern(/\b(?:annexe|Annexe)\s+([IVXLCDM]+|\d+)\b/i, "ANNEX", "annex-reference"),
      CORE.referencePattern(/\b(?:considérant|considerant)\s+\(?(\d{1,3})\)?\b/i, "RECITAL", "recital-reference")
    ],
    de: [
      CORE.referencePattern(/\b(?:Verordnung|VERORDNUNG)\s+\(?(?:EU|EG|Euratom)\)?\s*(?:Nr\.?\s*)?(\d{1,4}\/\d{1,4})\b/i, "REG", "regulation-reference"),
      CORE.referencePattern(/\b(?:Richtlinie|RICHTLINIE)\s+(\d{4}\/\d{1,4}\/?(?:EU|EG)?)\b/i, "DIR", "directive-reference"),
      CORE.referencePattern(/\b(?:Anhang|ANHANG)\s+([IVXLCDM]+|\d+)\b/i, "ANNEX", "annex-reference"),
      CORE.referencePattern(/\b(?:Erwägungsgrund|Erwaegungsgrund)\s+\(?(\d{1,3})\)?\b/i, "RECITAL", "recital-reference")
    ],
    es: [
      CORE.referencePattern(/\b(?:Reglamento|REGLAMENTO)\s+\(?(?:UE|CE|Euratom)\)?\s*(?:n\.?\s*)?(\d{1,4}\/\d{1,4})\b/i, "REG", "regulation-reference"),
      CORE.referencePattern(/\b(?:Directiva|DIRECTIVA)\s+(\d{4}\/\d{1,4}\/?(?:UE|CE)?)\b/i, "DIR", "directive-reference"),
      CORE.referencePattern(/\b(?:Anexo|ANEXO)\s+([IVXLCDM]+|\d+)\b/i, "ANNEX", "annex-reference"),
      CORE.referencePattern(/\b(?:considerando)\s+\(?(\d{1,3})\)?\b/i, "RECITAL", "recital-reference")
    ]
  };

  function parse(input, options = {}) {
    const startedAt = Date.now();
    const normalized = CORE.normalizeInput(input);
    const language = CORE.getLanguage(options.language || options.detection?.language || "en");
    const warnings = [];
    const text = normalized.normalizedText;

    if (!text || text.length < 50) {
      warnings.push(CORE.makeWarning("EMPTY_TEXT", "Document text is too short for meaningful regulation parsing.", { textLength: text.length }));
      return CORE.createEmptyParseResult({ startedAt, version: VERSION, documentType: DOCUMENT_TYPE, filename: normalized.filename, language, warnings });
    }

    const recitals = detectRecitals(text, language);
    const rawElements = discoverStructure(text, language, normalized.sourceUnits);

    if (rawElements.length === 0) {
      warnings.push(CORE.makeWarning("NO_STRUCTURE", "No regulation chapters, sections, articles, or annexes were detected.", { textLength: text.length, language }));
      return CORE.createEmptyParseResult({ startedAt, version: VERSION, documentType: DOCUMENT_TYPE, filename: normalized.filename, language, warnings });
    }

    const elements = extractArticleParagraphs(text, CORE.extractContent(text, rawElements));
    const articles = elements.filter(element => element.type === "ART" && !element.isEmpty);
    const hierarchyElements = elements.filter(element => element.type !== "ART" || element.isEmpty);
    const allElements = recitals ? [recitals, ...elements] : elements;
    const references = CORE.scanCrossReferences(
      allElements,
      language,
      REGULATION_REFERENCE_PATTERNS[language] || REGULATION_REFERENCE_PATTERNS.en,
      { allowedSourceTypes: ["RECITALS", "ART", "PARA", "SEC", "ANNEX"], skipNestedContent: true }
    );
    const metadata = extractMetadata(text, language, normalized.filename);

    if (articles.length < MIN_ARTICLE_COUNT_WARNING) {
      warnings.push(CORE.makeWarning("LOW_ARTICLE_COUNT", `Only ${articles.length} article(s) were parsed. Source may be incomplete, OCR-damaged, or not a regulation.`));
    }

    return {
      version: VERSION,
      documentType: DOCUMENT_TYPE,
      filename: normalized.filename || "",
      metadata,
      preamble: recitals,
      recitals,
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
        hasPreamble: Boolean(recitals),
        hasRecitals: Boolean(recitals),
        annexCount: elements.filter(element => element.type === "ANNEX").length,
        amendmentCount: 0,
        language,
        durationMs: Date.now() - startedAt
      }
    };
  }

  function discoverStructure(text, language, sourceUnits = []) {
    const patterns = STRUCTURAL_PATTERNS[language] || STRUCTURAL_PATTERNS.en;
    const lines = String(text || "").split("\n");
    const elements = [];
    let position = 0;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const trimmed = line.trim();

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

      position += line.length + 1;
    }

    return dedupeStructure(elements.sort((a, b) => a.position - b.position));
  }

  function detectRecitals(text, language) {
    const enactingMatch = text.match(ENACTING_MARKERS[language] || ENACTING_MARKERS.en);
    const startMatch = text.match(RECITAL_START_MARKERS[language] || RECITAL_START_MARKERS.en);
    const numberedStartMatch = text.match(/^\s*\(\d{1,3}\)\s+/m);

    if (!enactingMatch && !startMatch && !numberedStartMatch) return null;

    const startCandidates = [startMatch?.index, numberedStartMatch?.index].filter(index => typeof index === "number");
    const start = startCandidates.length ? Math.min(...startCandidates) : 0;
    const end = enactingMatch ? enactingMatch.index : findFirstBodyPosition(text);

    if (end <= start) return null;

    const content = CORE.extractRegion(text, start, end);
    if (content.length < 40) return null;

    return {
      id: "RECITALS",
      canonicalId: "RECITALS",
      type: "RECITALS",
      level: -1,
      heading: "Recitals",
      content,
      position: start,
      endPosition: end,
      recitalCount: countRecitals(content),
      isEmpty: false
    };
  }

  function findFirstBodyPosition(text) {
    const match = text.match(/\b(?:CHAPTER|Chapter|Article|ARTICLE|ANNEX|Annex)\s+([IVXLCDM]+|\d+)/);
    return match ? match.index : Math.min(5000, text.length);
  }

  function countRecitals(content) {
    const matches = content.match(/^\s*\(\d{1,3}\)\s+/gm);
    return matches ? matches.length : 0;
  }

  function extractArticleParagraphs(text, elements) {
    const paragraphElements = [];

    for (const article of elements.filter(element => element.type === "ART" && element.content)) {
      const articleStart = article.position + article.heading.length;
      const paragraphRegex = /^\s*(?:\((\d{1,3}[a-z]?)\)|(\d{1,3}[a-z]?)[.)])\s+(.+)$/gim;
      let match;

      while ((match = paragraphRegex.exec(article.content)) !== null) {
        const identifier = match[1] || match[2];
        const paragraphText = match[3].trim();
        const normalizedId = `${article.normalizedId}-PARA-${CORE.normalizeNumber(identifier, "en")}`;
        const canonicalId = `PARA-${normalizedId}`;

        paragraphElements.push({
          id: canonicalId,
          canonicalId,
          type: "PARA",
          prefix: "PARA",
          level: 3,
          identifier,
          normalizedId,
          sortKey: CORE.sortKey("PARA", normalizedId),
          position: articleStart + match.index,
          endPosition: null,
          lineIndex: article.lineIndex,
          heading: `Paragraph ${identifier}`,
          content: paragraphText,
          parentId: article.canonicalId,
          isAnnex: false,
          isAmendment: false,
          isEmpty: paragraphText.length < 20,
          source: article.source || CORE.sourceAnchorFromUnit(null)
        });

        if (match[0].length === 0) paragraphRegex.lastIndex += 1;
      }
    }

    return elements.concat(paragraphElements).sort((a, b) => a.position - b.position);
  }

  function extractMetadata(text, language, filename) {
    const firstBlock = String(text || "").split("\n").slice(0, 35).join("\n");
    const lines = firstBlock.split("\n");
    let title = CORE.titleFromFilename(filename);
    let regulationNumber = null;
    let jurisdiction = /European\s+Union|\(EU\)|\bEU\b/i.test(firstBlock) ? "European Union" : null;
    let adoptionDate = null;
    let adoptingBody = null;

    const numberPatterns = [
      /\bRegulation\s+\(EU\)\s+(?:No\.?\s*)?(\d{4}\/\d{1,4})\b/i,
      /\bREGULATION\s+\(EU\)\s+(?:No\.?\s*)?(\d{4}\/\d{1,4})\b/i,
      /\bRèglement\s+\(UE\)\s+(?:n°?\s*)?(\d{4}\/\d{1,4})\b/i
    ];

    for (const regex of numberPatterns) {
      const match = firstBlock.match(regex);
      if (match) {
        regulationNumber = `Regulation (EU) ${match[1]}`;
        break;
      }
    }

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 15 || trimmed.length > 260) continue;

      const letters = trimmed.replace(/[^A-Za-zÀ-ÿ]/g, "");
      if (!letters) continue;

      const uppercase = trimmed.replace(/[^A-ZÀ-Ý]/g, "");
      const upperRatio = uppercase.length / Math.max(letters.length, 1);
      if (upperRatio > 0.55 || /\bRegulation\s+\(EU\)/i.test(trimmed)) {
        title = trimmed;
        break;
      }
    }

    const bodyMatch = firstBlock.match(/\b(European\s+Parliament\s+and\s+(?:of\s+)?the\s+Council|Council\s+of\s+the\s+European\s+Union|European\s+Commission)\b/i);
    if (bodyMatch) adoptingBody = bodyMatch[1];

    const datePatterns = [
      /\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i,
      /\b\d{1,2}\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+\d{4}\b/i,
      /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/,
      /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{4}\b/
    ];

    for (const regex of datePatterns) {
      const match = firstBlock.match(regex);
      if (match) {
        adoptionDate = match[0];
        break;
      }
    }

    return {
      title: title || regulationNumber || "Untitled Regulation",
      jurisdiction,
      adoptionDate,
      language,
      sourceFilename: filename || null,
      regulationNumber,
      adoptingBody
    };
  }

  function extractHeadingTitle(heading, identifier) {
    const escaped = CORE.escapeRegex(String(identifier || ""));
    const regex = new RegExp(`^(?:CHAPTER|Chapter|SECTION|Section|ARTICLE|Article|ANNEX|Annex|Chapitre|Article|Annexe)\\s+${escaped}\\s*[.\\-—:]*\\s*`, "i");
    const title = String(heading || "").replace(regex, "").trim();
    return title || null;
  }

  function dedupeStructure(elements) {
    return CORE.dedupeBy(elements, element => `${element.canonicalId}|${element.position}`);
  }

  function summarize(parsed) {
    const parts = [];
    if (parsed.metadata.title) parts.push(parsed.metadata.title);
    if (parsed.metadata.regulationNumber) parts.push(parsed.metadata.regulationNumber);
    parts.push(`${parsed.stats.totalArticles} article(s)`);
    if (parsed.stats.hasRecitals) parts.push("recitals detected");
    if (parsed.stats.annexCount > 0) parts.push(`${parsed.stats.annexCount} annex(es)`);
    parts.push(`${parsed.stats.totalReferences} cross-reference(s)`);
    return parts.join(" · ");
  }

  return {
    VERSION,
    DOCUMENT_TYPE,
    STRUCTURAL_PATTERNS,
    REGULATION_REFERENCE_PATTERNS,
    parse,
    summarize,
    discoverStructure,
    detectRecitals,
    extractMetadata
  };
});
