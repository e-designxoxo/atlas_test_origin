/**
 * ATLAS Ingestion Pipeline - Directive Parser
 *
 * Parses EU directives into structured, source-grounded legal data.
 *
 * Directive-specific priorities:
 * - detect recitals separately from articles
 * - preserve chapter / section / article / paragraph hierarchy
 * - detect transposition obligations and deadlines
 * - extract directive number and EU adopting body metadata
 * - distinguish directives from regulations by transposition language
 */

(function initAtlasDirectiveParser(root, factory) {
  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    module.exports = factory(require("./_core.js"));
    return;
  }

  if (!root.ATLAS_ParserCore) {
    throw new Error("[directive-parser] ATLAS_ParserCore must be loaded before this module.");
  }

  const parser = factory(root.ATLAS_ParserCore);
  root.ATLAS_DirectiveParser = parser;
  if (root.window) root.window.ATLAS_DirectiveParser = parser;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAtlasDirectiveParser(CORE) {
  "use strict";

  const VERSION = "1.0.0";
  const DOCUMENT_TYPE = "directive";
  const MIN_ARTICLE_COUNT_WARNING = 3;

  const STRUCTURAL_PATTERNS = {
    en: [
      CORE.pattern("chapter-en", /\b(?:Chapter|CHAPTER)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "CH", match => match[1]),
      CORE.pattern("section-en", /\b(?:Section|SECTION)\s+(\d+[A-Za-z]?)\b[\s.\-—:]*([^]*)?$/i, 1, "SEC", match => match[1]),
      CORE.pattern("article-en", /\b(?:Article|ARTICLE)\s+(\d{1,4}[A-Za-z]?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?(?:\s*(?:bis|ter|quater))?)\b[\s.\-—:]*([^]*)?$/i, 2, "ART", match => match[1]),
      CORE.pattern("annex-en", /\b(?:Annex|ANNEX)\s+([IVXLCDM]+|\d+)\b[\s.\-—:]*([^]*)?$/i, 0, "ANNEX", match => match[1], { isAnnex: true })
    ],
    fr: [
      CORE.pattern("chapter-fr", /\b(?:Chapitre|CHAPITRE)\s+([IVXLCDM]+|\d+)(?:er|ère|eme|ème)?\b[\s.\-—:]*([^]*)?$/i, 0, "CH", match => match[1]),
      CORE.pattern("section-fr", /\b(?:Section|SECTION)\s+(\d+[A-Za-z]?)\b[\s.\-—:]*([^]*)?$/i, 1, "SEC", match => match[1]),
      CORE.pattern("article-fr", /\b(?:Article|ARTICLE|Art\.?)\s+(\d{1,4}(?:er|ère|eme|ème)?(?:[-–—](?:\d{1,4}|[A-Za-z]+))?(?:\s*(?:bis|ter|quater))?)\b[\s.\-—:]*([^]*)?$/i, 2, "ART", match => match[1]),
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
    en: /\b(?:HAVE|HAS)\s+ADOPTED\s+THIS\s+DIRECTIVE\s*:/i,
    fr: /\b(?:ONT|A)\s+ADOPTÉ\s+LA\s+PRÉSENTE\s+DIRECTIVE\s*:/i,
    de: /\b(?:HABEN|HAT)\s+FOLGENDE\s+RICHTLINIE\s+ERLASSEN\s*:/i,
    es: /\b(?:HAN|HA)\s+ADOPTADO\s+LA\s+PRESENTE\s+DIRECTIVA\s*:/i
  };

  const RECITAL_START_MARKERS = {
    en: /\b(?:Whereas|Having\s+regard\s+to|After\s+consulting|Acting\s+in\s+accordance\s+with)\b/i,
    fr: /\b(?:considérant|vu\s+le|après\s+consultation|statuant\s+conformément)\b/i,
    de: /\b(?:in\s+Erwägung|gestützt\s+auf|nach\s+Stellungnahme)\b/i,
    es: /\b(?:considerando|visto\s+el|previa\s+consulta)\b/i
  };

  const TRANSPOSITION_PATTERNS = {
    en: [/\btranspos(?:e|ed|ing|ition)\b/i, /\badopt\s+and\s+publish\b/i, /\bMember\s+States\s+shall\s+(bring\s+into\s+force|communicate|apply)\b/i],
    fr: [/\btranspos(?:er|ition|é|ée|és|ées)\b/i, /\badoptent\s+et\s+publient\b/i, /\bÉtats\s+membres\s+(mettent\s+en\s+vigueur|communiquent|appliquent)\b/i],
    de: [/\b(?:umsetzen|Umsetzung|umgesetzt)\b/i, /\bMitgliedstaaten\s+(setzen|erlassen|übermitteln|wenden)\b/i],
    es: [/\b(?:transponer|transposición|transpuesto)\b/i, /\bEstados\s+miembros\s+(adoptarán|comunicarán|aplicarán)\b/i]
  };

  const DIRECTIVE_REFERENCE_PATTERNS = {
    en: [
      CORE.referencePattern(/\b(?:Directive|DIRECTIVE)\s+\(?(?:EU|EC|EEC)?\)?\s*(?:No\.?\s*)?(\d{4}\/\d{1,4}\/?(?:EU|EC|EEC)?)\b/i, "DIR", "directive-reference"),
      CORE.referencePattern(/\b(?:Regulation|REGULATION)\s+\(?(?:EU|EC|Euratom)\)?\s*(?:No\.?\s*)?(\d{1,4}\/\d{1,4})\b/i, "REG", "regulation-reference"),
      CORE.referencePattern(/\b(?:Annex|ANNEX)\s+([IVXLCDM]+|\d+)\b/i, "ANNEX", "annex-reference"),
      CORE.referencePattern(/\b(?:recital|Recital)\s+\(?(\d{1,3})\)?\b/i, "RECITAL", "recital-reference")
    ],
    fr: [
      CORE.referencePattern(/\b(?:directive|Directive)\s+\(?(?:UE|CE|CEE)?\)?\s*(?:n°?\s*)?(\d{4}\/\d{1,4}\/?(?:UE|CE|CEE)?)\b/i, "DIR", "directive-reference"),
      CORE.referencePattern(/\b(?:règlement|Règlement|reglement|Reglement)\s+\(?(?:UE|CE|Euratom)\)?\s*(?:n°?\s*)?(\d{1,4}\/\d{1,4})\b/i, "REG", "regulation-reference"),
      CORE.referencePattern(/\b(?:annexe|Annexe)\s+([IVXLCDM]+|\d+)\b/i, "ANNEX", "annex-reference"),
      CORE.referencePattern(/\b(?:considérant|considerant)\s+\(?(\d{1,3})\)?\b/i, "RECITAL", "recital-reference")
    ],
    de: [
      CORE.referencePattern(/\b(?:Richtlinie|RICHTLINIE)\s+\(?(?:EU|EG|EWG)?\)?\s*(?:Nr\.?\s*)?(\d{4}\/\d{1,4}\/?(?:EU|EG|EWG)?)\b/i, "DIR", "directive-reference"),
      CORE.referencePattern(/\b(?:Verordnung|VERORDNUNG)\s+\(?(?:EU|EG|Euratom)\)?\s*(?:Nr\.?\s*)?(\d{1,4}\/\d{1,4})\b/i, "REG", "regulation-reference"),
      CORE.referencePattern(/\b(?:Anhang|ANHANG)\s+([IVXLCDM]+|\d+)\b/i, "ANNEX", "annex-reference")
    ],
    es: [
      CORE.referencePattern(/\b(?:Directiva|DIRECTIVA)\s+\(?(?:UE|CE|CEE)?\)?\s*(?:n\.?\s*)?(\d{4}\/\d{1,4}\/?(?:UE|CE|CEE)?)\b/i, "DIR", "directive-reference"),
      CORE.referencePattern(/\b(?:Reglamento|REGLAMENTO)\s+\(?(?:UE|CE|Euratom)\)?\s*(?:n\.?\s*)?(\d{1,4}\/\d{1,4})\b/i, "REG", "regulation-reference"),
      CORE.referencePattern(/\b(?:Anexo|ANEXO)\s+([IVXLCDM]+|\d+)\b/i, "ANNEX", "annex-reference")
    ]
  };

  function parse(input, options = {}) {
    const startedAt = Date.now();
    const normalized = CORE.normalizeInput(input);
    const language = CORE.getLanguage(options.language || options.detection?.language || "en");
    const warnings = [];
    const text = normalized.normalizedText;

    if (!text || text.length < 50) {
      warnings.push(CORE.makeWarning("EMPTY_TEXT", "Document text is too short for meaningful directive parsing.", { textLength: text.length }));
      return CORE.createEmptyParseResult({ startedAt, version: VERSION, documentType: DOCUMENT_TYPE, filename: normalized.filename, language, warnings });
    }

    const recitals = detectRecitals(text, language);
    const rawElements = discoverStructure(text, language, normalized.sourceUnits);

    if (rawElements.length === 0) {
      warnings.push(CORE.makeWarning("NO_STRUCTURE", "No directive chapters, sections, articles, or annexes were detected.", { textLength: text.length, language }));
      return CORE.createEmptyParseResult({ startedAt, version: VERSION, documentType: DOCUMENT_TYPE, filename: normalized.filename, language, warnings });
    }

    const elements = extractArticleParagraphs(text, CORE.extractContent(text, rawElements));
    const articles = elements.filter(element => element.type === "ART" && !element.isEmpty);
    const hierarchyElements = elements.filter(element => element.type !== "ART" || element.isEmpty);
    const allElements = recitals ? [recitals, ...elements] : elements;
    const references = CORE.scanCrossReferences(
      allElements,
      language,
      DIRECTIVE_REFERENCE_PATTERNS[language] || DIRECTIVE_REFERENCE_PATTERNS.en,
      { allowedSourceTypes: ["RECITALS", "ART", "PARA", "SEC", "ANNEX"], skipNestedContent: true }
    );
    const transpositionArticles = detectTranspositionArticles(elements, language);
    const metadata = extractMetadata(text, language, normalized.filename);

    if (articles.length < MIN_ARTICLE_COUNT_WARNING) {
      warnings.push(CORE.makeWarning("LOW_ARTICLE_COUNT", `Only ${articles.length} article(s) were parsed. Source may be incomplete, OCR-damaged, or not a directive.`));
    }

    if (transpositionArticles.length === 0) {
      warnings.push(CORE.makeWarning("NO_TRANSPOSITION_SIGNAL", "No strong transposition article was detected. This may be an incomplete directive extract."));
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
      transpositionArticles,
      amendments: [],
      warnings,
      stats: {
        totalArticles: articles.length,
        totalElements: elements.length,
        totalReferences: references.length,
        resolvedReferences: references.filter(reference => reference.resolved).length,
        hasPreamble: Boolean(recitals),
        hasRecitals: Boolean(recitals),
        transpositionArticleCount: transpositionArticles.length,
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
    return match ? match.index : Math.min(6000, text.length);
  }

  function countRecitals(content) {
    const matches = content.match(/^\s*\(\d{1,3}\)\s+/gm);
    return matches ? matches.length : 0;
  }

  function extractArticleParagraphs(text, elements) {
    const paragraphs = [];

    for (const article of elements.filter(element => element.type === "ART" && element.content)) {
      const articleStart = article.position + article.heading.length;
      const paragraphRegex = /^\s*(?:\((\d{1,3}[a-z]?)\)|(\d{1,3}[a-z]?)[.)])\s+(.+)$/gim;
      let match;

      while ((match = paragraphRegex.exec(article.content)) !== null) {
        const identifier = match[1] || match[2];
        const paragraphText = match[3].trim();
        const normalizedId = `${article.normalizedId}-PARA-${CORE.normalizeNumber(identifier, "en")}`;
        const canonicalId = `PARA-${normalizedId}`;

        paragraphs.push({
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
      }
    }

    return elements.concat(paragraphs).sort((a, b) => a.position - b.position);
  }

  function detectTranspositionArticles(elements, language) {
    const indicators = TRANSPOSITION_PATTERNS[language] || TRANSPOSITION_PATTERNS.en;
    const matches = [];

    for (const element of elements) {
      if (element.type !== "ART" || !element.content || element.isEmpty) continue;
      const matched = indicators.filter(regex => regex.test(element.content));
      if (matched.length >= 1) {
        matches.push({
          canonicalId: element.canonicalId,
          type: "TRANSPOSITION",
          heading: element.heading,
          position: element.position,
          indicatorCount: matched.length
        });
      }
    }

    return matches;
  }

  function extractMetadata(text, language, filename) {
    const firstBlock = String(text || "").split("\n").slice(0, 35).join("\n");
    const lines = firstBlock.split("\n");
    let title = CORE.titleFromFilename(filename);
    let directiveNumber = null;
    let jurisdiction = /European\s+Union|\(EU\)|\bEU\b/i.test(firstBlock) ? "European Union" : null;
    let adoptionDate = null;
    let adoptingBody = null;
    let transpositionDeadline = null;

    const numberMatch = firstBlock.match(/\bDirective\s+\(?(?:EU|EC|EEC)?\)?\s*(?:No\.?\s*)?(\d{4}\/\d{1,4}\/?(?:EU|EC|EEC)?)\b/i);
    if (numberMatch) directiveNumber = `Directive ${numberMatch[1]}`;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 15 || trimmed.length > 260) continue;
      const letters = trimmed.replace(/[^A-Za-zÀ-ÿ]/g, "");
      const uppercase = trimmed.replace(/[^A-ZÀ-Ý]/g, "");
      if (letters && (uppercase.length / Math.max(letters.length, 1) > 0.55 || /\bDirective\b/i.test(trimmed))) {
        title = trimmed;
        break;
      }
    }

    const bodyMatch = firstBlock.match(/\b(European\s+Parliament\s+and\s+(?:of\s+)?the\s+Council|Council\s+of\s+the\s+European\s+Union|European\s+Commission)\b/i);
    if (bodyMatch) adoptingBody = bodyMatch[1];

    const dateMatch = firstBlock.match(/\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i);
    if (dateMatch) adoptionDate = dateMatch[0];

    const deadlineMatch = text.match(/\b(?:by|before|no\s+later\s+than|from)\s+(\d{1,2}\s+\w+\s+\d{4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/i);
    if (deadlineMatch && /transpos|Member States shall|adopt and publish/i.test(CORE.extractContext(text, deadlineMatch.index, deadlineMatch[0], 140))) {
      transpositionDeadline = deadlineMatch[1];
    }

    return {
      title: title || directiveNumber || "Untitled Directive",
      jurisdiction,
      adoptionDate,
      language,
      sourceFilename: filename || null,
      directiveNumber,
      adoptingBody,
      transpositionDeadline
    };
  }

  function extractHeadingTitle(heading, identifier) {
    const escaped = CORE.escapeRegex(String(identifier || ""));
    const regex = new RegExp(`^(?:CHAPTER|Chapter|SECTION|Section|ARTICLE|Article|ANNEX|Annex|Chapitre|Article|Annexe)\\s+${escaped}\\s*[.\\-—:]*\\s*`, "i");
    const title = String(heading || "").replace(regex, "").trim();
    return title || null;
  }

  function summarize(parsed) {
    const parts = [];
    if (parsed.metadata.title) parts.push(parsed.metadata.title);
    if (parsed.metadata.directiveNumber) parts.push(parsed.metadata.directiveNumber);
    parts.push(`${parsed.stats.totalArticles} article(s)`);
    if (parsed.stats.hasRecitals) parts.push("recitals detected");
    if (parsed.stats.transpositionArticleCount > 0) parts.push(`${parsed.stats.transpositionArticleCount} transposition article(s)`);
    return parts.join(" · ");
  }

  return {
    VERSION,
    DOCUMENT_TYPE,
    STRUCTURAL_PATTERNS,
    DIRECTIVE_REFERENCE_PATTERNS,
    parse,
    summarize,
    discoverStructure,
    detectRecitals,
    detectTranspositionArticles,
    extractMetadata
  };
});
